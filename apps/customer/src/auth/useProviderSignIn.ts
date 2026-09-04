import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { ApiError } from '../api/client';
import { track } from '../lib/analytics';
import { useAuth } from './AuthContext';

/**
 * Continue with Google.
 *
 * The only thing that leaves this device is the ID token Google issued. The
 * server verifies its signature and audience and reads the identity out of it,
 * so nothing here sends an email, a name or a user id — none of which the
 * server could believe anyway.
 *
 * There is **no client secret**. The Android and iOS client ids below are
 * public by design; the flow that needs a secret is the one for confidential
 * servers, not for apps.
 *
 * Cancellation is not an error. Dismissing the Google sheet is an ordinary
 * thing to do, and the design says so explicitly: return to the landing with a
 * calm line and no error styling on the buttons.
 */
export type ProviderState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * Client ids come from the environment, per platform. `EXPO_PUBLIC_` is
 * deliberate — these are not secrets, and Metro inlines them at build time.
 */
const blank = (v: string | undefined) => (v && v.trim() !== '' ? v : undefined);

const ANDROID_ID = blank(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID);
const IOS_ID = blank(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS);
const WEB_ID = blank(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB);

/**
 * Whether Google sign-in can work **on this platform**, decided at module load
 * so a caller can check it *before* mounting the hook below.
 *
 * This has to be readable without rendering anything, because
 * `useIdTokenAuthRequest` does not fail politely: it resolves the id for the
 * current platform inside a `useMemo` and calls `invariantClientId`, which
 * *throws* when that id is `undefined`. The throw happens during render, so a
 * guard inside `signIn` — which is where this check used to live — can never
 * run. The whole sign-in screen died before painting a single button, on every
 * platform, and the only symptom was a red error overlay and a bounce back to
 * the homepage.
 *
 * So: never mount `useGoogleSignIn` unless this is true. `ProviderButtons`
 * enforces that by choosing between two components rather than two branches.
 */
export const GOOGLE_CONFIGURED = Boolean(
  Platform.select({ android: ANDROID_ID, ios: IOS_ID, default: WEB_ID }),
);

/**
 * **Only call this when `GOOGLE_CONFIGURED` is true.** See the note above — it
 * throws during render otherwise, and no `try` around a hook can catch that.
 */
export function useGoogleSignIn(onSignedIn: (created: boolean) => void | Promise<void>) {
  const { providerAuth } = useAuth();
  const [state, setState] = useState<ProviderState>({ kind: 'idle' });
  /**
   * Set when the customer taps Cancel on the hand-off screen.
   *
   * Nothing can recall a browser that is already open, so `promptAsync` may
   * still resolve — successfully — well after they said no. Without this, a
   * cancelled attempt could sign them in a second later, which is worse than
   * either outcome they chose between.
   */
  const abandoned = useRef(false);

  // `useIdTokenAuthRequest` rather than the access-token variant: an ID token is
  // what the server can verify, and an access token would only let us ask
  // Google who this is — which is the same question, one round trip later and
  // with no signature to check.
  //
  // `webClientId` is named explicitly rather than left to the `clientId`
  // fallback, because the library looks for the platform-specific prop first
  // and only then falls back — so naming it is the difference between a
  // deliberate value and a coincidence.
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: ANDROID_ID,
    iosClientId: IOS_ID,
    webClientId: WEB_ID,
  });

  const signIn = useCallback(async () => {
    track({ name: 'google_sign_in_started' });
    abandoned.current = false;
    setState({ kind: 'pending' });
    try {
      const result = await promptAsync();
      if (abandoned.current) return;

      if (result.type === 'dismiss' || result.type === 'cancel') {
        track({ name: 'google_sign_in_failed', reason: 'cancelled' });
        setState({ kind: 'cancelled' });
        return;
      }
      if (result.type !== 'success') {
        track({ name: 'google_sign_in_failed', reason: 'provider' });
        setState({ kind: 'error', message: 'Couldn’t finish sign-in. Try email instead.' });
        return;
      }

      const idToken = result.params.id_token;
      if (!idToken) {
        track({ name: 'google_sign_in_failed', reason: 'provider' });
        setState({ kind: 'error', message: 'Couldn’t finish sign-in. Try email instead.' });
        return;
      }

      const created = await providerAuth('google', idToken);
      // Checked again: the exchange is a second round trip, and Cancel during
      // it must not be undone by its result either.
      if (abandoned.current) return;
      track({ name: 'google_sign_in_success', created });
      setState({ kind: 'idle' });
      await onSignedIn(created);
    } catch (e) {
      if (abandoned.current) return;
      track({
        name: 'google_sign_in_failed',
        reason: e instanceof ApiError ? 'provider' : 'network',
      });
      // Never surface a raw backend error; the design has specific copy for
      // each of these and none of it is a stack trace.
      setState({
        kind: 'error',
        message:
          e instanceof ApiError
            ? e.message
            : 'You’re offline, or we couldn’t reach Google. Nothing has been lost — try again.',
      });
    }
  }, [promptAsync, providerAuth, onSignedIn]);

  return {
    signIn,
    state,
    reset: () => setState({ kind: 'idle' }),
    /**
     * Stop waiting and treat the attempt as cancelled — the hand-off screen's
     * Cancel. Any result that arrives afterwards is discarded.
     */
    cancel: useCallback(() => {
      abandoned.current = true;
      track({ name: 'google_sign_in_failed', reason: 'cancelled' });
      setState({ kind: 'cancelled' });
    }, []),
    /** False until the auth request has finished being prepared. */
    ready: Boolean(request),
  };
}
