import { useCallback, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ApiError } from '../api/client';
import { track } from '../lib/analytics';
import { useAuth } from './AuthContext';
import { WEB_CLIENT_ID, type ProviderSignIn, type ProviderState } from './providerSignIn.types';

export type { ProviderState };

/**
 * Continue with Google — web.
 *
 * Native uses Google's SDK, which has no browser and no redirect; on web there
 * is nothing but the browser, so `expo-auth-session` stays. The redirect here
 * goes to the page's own origin rather than a custom URI scheme, which is the
 * ordinary supported case and none of the Android trouble applies.
 *
 * The two files share their contract via `providerSignIn.types.ts`, because
 * TypeScript only ever checks the native one against call sites — Metro alone
 * knows about this file.
 */

/**
 * `maybeCompleteAuthSession` is **web-only**: it exists in
 * `ExpoWebBrowser.web.js` and nowhere else, and `WebBrowser.js` guards on its
 * presence, so on native it silently does nothing. That is exactly why it never
 * fixed the Android redirect. Here it is the right call and does real work —
 * closing the popup and handing the result back.
 */
WebBrowser.maybeCompleteAuthSession();

/** Whether Google sign-in can work in this build. */
export const GOOGLE_CONFIGURED = Boolean(WEB_CLIENT_ID);

/** **Only call when `GOOGLE_CONFIGURED` is true.** */
export function useGoogleSignIn(
  onSignedIn: (created: boolean) => void | Promise<void>,
): ProviderSignIn {
  const { providerAuth } = useAuth();
  const [state, setState] = useState<ProviderState>({ kind: 'idle' });
  const abandoned = useRef(false);

  // `useIdTokenAuthRequest` rather than the access-token variant: an ID token is
  // what the server can verify, and an access token would only let us ask Google
  // who this is — the same question, one round trip later, with no signature to
  // check.
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
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
    cancel: useCallback(() => {
      abandoned.current = true;
      track({ name: 'google_sign_in_failed', reason: 'cancelled' });
      setState({ kind: 'cancelled' });
    }, []),
    /** False until the auth request has finished being prepared. */
    ready: Boolean(request),
  };
}
