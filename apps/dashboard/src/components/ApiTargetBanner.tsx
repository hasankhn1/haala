import { unstable_noStore as noStore } from 'next/cache';
import { API_ORIGIN, IS_REMOTE_API } from '@/lib/session';

/**
 * Says out loud which API this dashboard is talking to.
 *
 * It exists because that question was once answerable only by reading source
 * and checking a process start time: a dev server booted before `.env.local`
 * was edited kept pointing at production for an afternoon, and every screen
 * looked completely normal while it did.
 *
 * **Silent on localhost.** A warning that shows all the time is furniture, and
 * furniture is not read. This appears only when edits would land somewhere
 * other than the machine you are sitting at, which is the only time it is
 * information.
 *
 * Rendered from the root layout rather than either dashboard shell, so it also
 * covers `/login` — which API you are authenticating against is worth knowing
 * before you type a password, not after.
 */
export function ApiTargetBanner() {
  /*
   * Opts every route containing this out of static generation.
   *
   * Without it `/login` is prerendered at **build** time and the banner is
   * baked in from whatever `HAALA_API_URL` the build machine had — so a
   * production deploy pointed at the live API would serve a login page with no
   * warning on it at all. Found by serving a real build rather than trusting
   * the component.
   *
   * The cost is a server render for a 1KB page on an internal dashboard, which
   * is nothing against silently mislabelling which database you are about to
   * sign in to.
   */
  noStore();

  if (!IS_REMOTE_API) return null;

  // Just the host: the scheme and path are noise, and the host is the part that
  // tells you whether this is yours.
  let host = API_ORIGIN;
  try {
    host = new URL(API_ORIGIN).host;
  } catch {
    // A malformed HAALA_API_URL is worth showing verbatim rather than hiding.
  }

  return (
    <div className="api-banner" role="status">
      <span className="api-banner-dot" aria-hidden="true" />
      <strong>Live data</strong>
      <span className="api-banner-host">{host}</span>
      <span className="api-banner-note">Anything you change here affects real orders.</span>
    </div>
  );
}
