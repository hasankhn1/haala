import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../../../common/errors';
import { config } from '../../../config';
import type { ProviderKind } from '../auth-provider.repository';

/**
 * Turning a token from Google or Apple into an identity we are willing to trust.
 *
 * This is the security boundary of the whole feature. Everything downstream —
 * finding the customer, linking, creating one — acts on what this returns, so
 * the rules are narrow on purpose:
 *
 *   - **The signature is checked, always.** A client can put any JSON it likes
 *     in a request body; the only reason to believe `sub` belongs to this person
 *     is that the provider signed it.
 *   - **The audience is pinned** to our own client IDs. A validly-signed token
 *     issued for somebody else's app is a real attack, and it is the check most
 *     often left out.
 *   - **`sub` is the identity.** Never the email. An email can change hands, be
 *     a private relay, or be absent entirely; `sub` is stable per provider.
 *   - **`emailVerified` is reported, not assumed.** Whether it is safe to attach
 *     this identity to an existing account is a decision for the caller, and it
 *     depends on that flag.
 */
export interface VerifiedIdentity {
  provider: ProviderKind;
  /** The provider's stable id. Becomes `auth_providers.providerUserId`. */
  subject: string;
  /**
   * Absent for Apple after the first authorization, and a relay address when
   * the customer hid theirs. Nothing may depend on having it.
   */
  email: string | null;
  /**
   * Only true when the provider states it. Linking this identity to an account
   * that already owns the address is safe **only** when true — otherwise
   * anyone able to put an arbitrary address in a provider profile could claim
   * somebody else's account.
   */
  emailVerified: boolean;
  /** A display name if the provider offered one. Never required. */
  name: string | null;
}

let googleClient: OAuth2Client | null = null;

function audiences(): string[] {
  const list = config.oauth.googleAudiences;
  if (list.length === 0) {
    throw AppError.serviceUnavailable(
      'Google sign-in is not configured on this server. Use email instead.',
    );
  }
  return list;
}

/**
 * Verify a Google ID token.
 *
 * `verifyIdToken` does the work that matters: it fetches Google's current
 * signing keys, checks the signature and expiry, and — because `audience` is
 * passed — rejects a token minted for a different client id.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedIdentity> {
  const expected = audiences();
  googleClient ??= new OAuth2Client();

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: expected });
    payload = ticket.getPayload();
  } catch {
    // Deliberately opaque. The distinction between expired, wrong audience and
    // forged is useful to an attacker and to nobody else.
    throw AppError.unauthorized('That Google sign-in could not be verified. Try again.');
  }

  if (!payload?.sub) {
    throw AppError.unauthorized('That Google sign-in could not be verified. Try again.');
  }
  // `verifyIdToken` already enforces this; asserting it again is cheap and
  // means a future refactor cannot quietly drop the audience check.
  if (!payload.aud || !expected.includes(payload.aud)) {
    throw AppError.unauthorized('That Google sign-in could not be verified. Try again.');
  }

  return {
    provider: 'google',
    subject: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
  };
}

/**
 * Verify an Apple identity token.
 *
 * Not implemented, and failing loudly rather than silently: there is no Apple
 * developer account yet, so no key id or client id to verify against. The
 * signature is the same shape of work as Google's — fetch Apple's JWKS, check
 * `iss`, `aud` and `exp`, take `sub` — and this is where it goes.
 *
 * The rest of the system already accepts `apple`: it is in the provider enum,
 * `VerifiedIdentity` covers it, and `providerAuth` is written against the
 * interface rather than against Google. Adding it is this function plus a
 * button.
 */
export async function verifyAppleIdToken(_idToken: string): Promise<VerifiedIdentity> {
  throw AppError.notImplemented(
    'Apple sign-in is not available yet. Use Google or an email address.',
  );
}

/** Dispatch, so callers never choose a verifier by hand. */
export function verifierFor(
  provider: 'google' | 'apple',
): (idToken: string) => Promise<VerifiedIdentity> {
  return provider === 'google' ? verifyGoogleIdToken : verifyAppleIdToken;
}
