import { useCallback, useState } from 'react';
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
 *
 * Unset, `configured` is false and the button renders disabled with a reason
 * rather than opening a browser that will fail.
 */
const ANDROID_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
const IOS_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
const WEB_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;

export function useGoogleSignIn(onSignedIn: (created: boolean) => void | Promise<void>) {
  const { providerAuth } = useAuth();
  const [state, setState] = useState<ProviderState>({ kind: 'idle' });

  const platformId = Platform.select({ android: ANDROID_ID, ios: IOS_ID, default: WEB_ID });
  const configured = Boolean(platformId ?? WEB_ID);

  // `useIdTokenAuthRequest` rather than the access-token variant: an ID token is
  // what the server can verify, and an access token would only let us ask
  // Google who this is — which is the same question, one round trip later and
  // with no signature to check.
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: ANDROID_ID,
    iosClientId: IOS_ID,
    clientId: WEB_ID,
  });

  const signIn = useCallback(async () => {
    if (!configured) {
      track({ name: 'google_sign_in_failed', reason: 'unconfigured' });
      setState({
        kind: 'error',
        message: 'Google sign-in isn’t set up on this build yet. Use an email address.',
      });
      return;
    }

    track({ name: 'google_sign_in_started' });
    setState({ kind: 'pending' });
    try {
      const result = await promptAsync();

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
      track({ name: 'google_sign_in_success', created });
      setState({ kind: 'idle' });
      await onSignedIn(created);
    } catch (e) {
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
  }, [configured, promptAsync, providerAuth, onSignedIn]);

  return {
    signIn,
    state,
    reset: () => setState({ kind: 'idle' }),
    /** False until the auth request has been prepared, or if ids are missing. */
    ready: configured && Boolean(request),
    configured,
  };
}
