import { useCallback, useRef, useState } from 'react';
import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { ApiError } from '../api/client';
import { track } from '../lib/analytics';
import { useAuth } from './AuthContext';
import {
  IOS_CLIENT_ID,
  WEB_CLIENT_ID,
  type ProviderSignIn,
  type ProviderState,
} from './providerSignIn.types';

export type { ProviderState };

/**
 * Continue with Google — native (Android and iOS).
 *
 * The only thing that leaves this device is the ID token Google issued. The
 * server verifies its signature and audience and reads the identity out of it,
 * so nothing here sends an email, a name or a user id — none of which the
 * server could believe anyway. There is **no client secret**; the flow needing
 * one is for confidential servers, not for apps.
 *
 * **Why this is Google's SDK and not `expo-auth-session`.** The browser flow
 * redirected back through a custom URI scheme, and Google has deprecated those
 * on Android for app-impersonation reasons — new clients have them switched off
 * and need a toggle in Advanced Settings to work at all. Even re-enabled, the
 * redirect arrived as a plain deep link that nothing reliably caught: on a
 * device that reclaims memory while the browser is open, the app restarts, the
 * pending promise is gone, and expo-router renders "Unmatched Route" over a
 * sign-in that Google had already completed. `maybeCompleteAuthSession`, the
 * usual answer, is **web-only** — it does not exist in the native module.
 *
 * This SDK has no browser, no redirect and no custom scheme: it returns the
 * token straight to the app, which removes that whole class of failure rather
 * than working around it. It is also what Google now recommends for Android.
 *
 * The web build keeps `expo-auth-session` — see `useProviderSignIn.web.ts`.
 * There the redirect goes to the page's own origin, which is ordinary and
 * supported.
 *
 * Cancellation is not an error. Dismissing the sheet is an ordinary thing to
 * do, and the design says so: return to the landing with a calm line and no
 * error styling on the buttons.
 */

/**
 * Whether Google sign-in can work on this platform, decided at module load so a
 * caller can check it *before* mounting the hook.
 *
 * `WEB_CLIENT_ID` even on Android: see the note on it — the native SDK mints
 * its ID token for the *web* client, and without one there is no `idToken` to
 * send anywhere.
 */
export const GOOGLE_CONFIGURED = Boolean(WEB_CLIENT_ID);

/**
 * Android's `CommonStatusCodes.DEVELOPER_ERROR`, which the native module
 * stringifies as the rejection code. Not in the SDK's exported `statusCodes`,
 * which is why it has to be spelled out here.
 */
const DEVELOPER_ERROR = '10';

if (GOOGLE_CONFIGURED) {
  // Synchronous and cheap; documented as safe to call at module scope, and
  // doing it here means the first press does not race the configuration.
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
  });
}

/** **Only call when `GOOGLE_CONFIGURED` is true.** */
export function useGoogleSignIn(
  onSignedIn: (created: boolean) => void | Promise<void>,
): ProviderSignIn {
  const { providerAuth } = useAuth();
  const [state, setState] = useState<ProviderState>({ kind: 'idle' });
  /**
   * Set when the customer taps Cancel on the hand-off screen.
   *
   * The sheet cannot be recalled once open, so it may still resolve
   * successfully after they said no. Without this, a cancelled attempt could
   * sign them in a second later — worse than either outcome they chose between.
   */
  const abandoned = useRef(false);

  const signIn = useCallback(async () => {
    track({ name: 'google_sign_in_started' });
    abandoned.current = false;
    setState({ kind: 'pending' });
    try {
      // Android only, and a no-op elsewhere. Without Play Services the sheet
      // cannot appear at all, and this says so with Google's own dialog rather
      // than failing opaquely.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();
      if (abandoned.current) return;

      if (!isSuccessResponse(response)) {
        // `cancelled` and `noSavedCredentialFound` both land here; neither is a
        // failure worth colouring red.
        track({ name: 'google_sign_in_failed', reason: 'cancelled' });
        setState({ kind: 'cancelled' });
        return;
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        // Almost always a missing or wrong `webClientId`: Google returns a user
        // but no token to prove it with.
        track({ name: 'google_sign_in_failed', reason: 'provider' });
        setState({
          kind: 'error',
          message: 'Google didn’t return a sign-in token. Try email instead.',
        });
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

      const code = (e as { code?: string }).code;
      const detail = e instanceof Error ? e.message : String(e);

      // Named in development, whatever it is. An unrecognised code used to fall
      // into the offline branch below and tell the customer — and us — the one
      // thing that was definitely not true.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(`[auth] Google sign-in failed. code=${code ?? '(none)'} ${detail}`);
      }

      /*
       * `DEVELOPER_ERROR`, which Android reports as status 10.
       *
       * It means Google would not accept the app itself: the package name and
       * signing certificate did not match a registered Android OAuth client, or
       * the configured `webClientId` belongs to a different project. It is
       * nothing to do with connectivity, and it is the single most likely
       * failure the first time a release APK is tried — a release build is
       * signed by the EAS keystore, whose SHA-1 differs from the local debug
       * one, so registering only the debug fingerprint produces exactly this.
       *
       * Reported separately because the generic message below ("you're
       * offline") sends whoever reads it in precisely the wrong direction.
       */
      if (code === DEVELOPER_ERROR || detail.includes('DEVELOPER_ERROR')) {
        track({ name: 'google_sign_in_failed', reason: 'provider' });
        setState({
          kind: 'error',
          message: 'Google sign-in isn’t set up for this build yet. Use an email address.',
        });
        return;
      }

      if (code === statusCodes.SIGN_IN_CANCELLED) {
        track({ name: 'google_sign_in_failed', reason: 'cancelled' });
        setState({ kind: 'cancelled' });
        return;
      }
      if (code === statusCodes.IN_PROGRESS) {
        // A second press while the sheet is already up. Not an error, and not
        // something to show — the sheet they are looking at is the answer.
        return;
      }

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
            : code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
              ? 'Google Play Services is unavailable on this device. Use an email address.'
              : 'You’re offline, or we couldn’t reach Google. Nothing has been lost — try again.',
      });
    }
  }, [providerAuth, onSignedIn]);

  return {
    signIn,
    state,
    reset: () => setState({ kind: 'idle' }),
    cancel: useCallback(() => {
      abandoned.current = true;
      track({ name: 'google_sign_in_failed', reason: 'cancelled' });
      setState({ kind: 'cancelled' });
    }, []),
    // Nothing to prepare: there is no auth request to build, so the row is
    // usable as soon as it renders.
    ready: true,
  };
}
