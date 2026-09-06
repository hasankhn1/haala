/**
 * Loads the Google Maps JavaScript API, once.
 *
 * The API arrives as a `<script>` tag rather than a module, so this is done by
 * hand — and exactly once per page. Two map components mounting together, or
 * one remounting on navigation, must not each append a script: Google warns
 * loudly about that and the second load can clobber the first. So the promise
 * is memoised at module scope and every caller awaits the same one.
 *
 * **The key is public.** `EXPO_PUBLIC_` inlines it into the bundle, which is
 * unavoidable for a browser key and is how Google's own model works — the
 * protection is an HTTP-referrer restriction on the key, not secrecy. It is
 * deliberately a *different* key from `GOOGLE_MAPS_API_KEY`: that one has no
 * `EXPO_PUBLIC_` prefix so Metro never inlines it and it cannot reach this
 * bundle at all, and an Android-restricted key does not work in a browser
 * anyway.
 *
 * Rejects rather than hangs when the key is absent, so the caller can fall back
 * to a neutral panel instead of spinning on a promise it cannot keep.
 */
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY?.trim();

/** Whether a web map can work at all. Read before rendering one. */
export const WEB_MAPS_CONFIGURED = Boolean(KEY);

/**
 * Global name Google calls when the API is genuinely ready.
 *
 * **Why a callback rather than `script.onload`.** With `loading=async`, which
 * Google now asks for, `onload` fires while the namespace is still being built:
 * at that moment `google.maps` exists but has *neither* `Map` nor
 * `importLibrary` on it. Two attempts here failed on exactly that — first
 * `api.Map is not a constructor`, then
 * `google.maps.importLibrary is not a function` — and both looked like the API
 * was broken when the truth was simply that it had not finished loading.
 * `callback=` is the documented signal for "now it is safe", and it is the only
 * one that is actually reliable.
 */
const CALLBACK = '__haalaGoogleMapsReady';

/** Populated once the namespace is usable — `Map` being the thing we need. */
const usable = () => typeof google !== 'undefined' && typeof google.maps?.Map === 'function';

let pending: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (pending) return pending;

  pending = new Promise<typeof google.maps>((resolve, reject) => {
    if (!KEY) {
      reject(new Error('EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY is not set'));
      return;
    }
    // Already loaded — a hot reload resets `pending` while the script stays in
    // the DOM. Checked on `Map` specifically, because `google.maps` existing
    // proves nothing; that assumption is what broke this twice.
    if (usable()) {
      resolve(google.maps);
      return;
    }

    const fail = (message: string) => {
      // Cleared so a later mount can retry: a failed script is usually a
      // blocked request or a bad referrer restriction, and both can change.
      pending = null;
      delete (window as unknown as Record<string, unknown>)[CALLBACK];
      reject(new Error(message));
    };

    (window as unknown as Record<string, unknown>)[CALLBACK] = () => {
      delete (window as unknown as Record<string, unknown>)[CALLBACK];
      if (!usable()) {
        fail('Google Maps called back without a usable API');
        return;
      }
      /*
       * `Marker` lives in the `marker` library. The callback guarantees the
       * core namespace, and on current versions that includes `Marker` — but
       * importing explicitly when `importLibrary` is available costs nothing
       * and removes the version guess. Skipped entirely on versions that have
       * no `importLibrary`, where the classic namespace is already complete.
       */
      if (typeof google.maps.importLibrary === 'function') {
        void Promise.all([
          google.maps.importLibrary('maps'),
          google.maps.importLibrary('marker'),
        ])
          .then(() => resolve(google.maps))
          // The core API is already usable here, so a library import failing
          // is not worth failing the whole map over.
          .catch(() => resolve(google.maps));
        return;
      }
      resolve(google.maps);
    };

    const script = document.createElement('script');
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(KEY)}` +
      '&v=weekly' +
      '&loading=async' +
      `&callback=${CALLBACK}`;
    script.async = true;
    script.onerror = () => fail('Google Maps failed to load');
    document.head.appendChild(script);
  });

  return pending;
}
