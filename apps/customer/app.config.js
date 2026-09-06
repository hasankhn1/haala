/**
 * Dynamic app config.
 *
 * `app.json` stays the static source of truth — Expo passes its contents in as
 * `config`, and this file only layers on what must come from the environment.
 *
 * Everything here follows one rule, and it is worth stating because breaking it
 * cost two builds: **this file runs on the build machine, not on the phone.**
 * That is what makes it able to read ordinary environment variables — an EAS
 * variable, secret or not, is a real `process.env` entry here. Values it emits
 * reach the device by being baked into the build: the Maps key into
 * `AndroidManifest.xml`, and `extra` into the app manifest.
 *
 * App code cannot do this. A phone has no environment, so the only values
 * `process.env` yields there are the ones Metro **inlined** at bundle time, and
 * Metro inlines only names beginning `EXPO_PUBLIC_`. Reading an unprefixed
 * variable from a component silently yields `undefined` in every production
 * build — while working in dev, which is exactly how it shipped.
 *
 * So: anything the app needs and the environment holds comes through here.
 *
 * Where the values come from:
 *   local  → `apps/customer/.env` (gitignored; Expo CLI loads it before this runs)
 *   EAS    → an EAS environment variable, selected by the build profile's
 *            `environment` field in eas.json
 *
 * The Maps key is Android-only. `DeliveryMap` uses `PROVIDER_DEFAULT`, which is
 * Google Maps on Android but **Apple Maps** on iOS — iOS needs no key unless we
 * switch it to PROVIDER_GOOGLE.
 */
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // A keyless Android build renders grey tiles on the tracking screen *and* the
  // address picker, and nothing fails loudly at runtime — it just looks broken.
  // Fail the build instead of shipping that.
  if (!apiKey && process.env.EAS_BUILD) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY is not set for this EAS build.\n\n' +
        'On EAS this comes from an EAS *environment* variable, selected by the\n' +
        'build profile\'s `environment` field in eas.json — not from .env, which\n' +
        'is gitignored and never reaches the build worker. Note that\n' +
        'EXPO_PUBLIC_API_URL is inline in eas.json, which is why that one never\n' +
        'fails and this one can.\n\n' +
        'Set it with:\n' +
        '  eas env:set --name GOOGLE_MAPS_API_KEY --value <key> ' +
        '--environment preview --environment production\n\n' +
        'If it *was* set and has stopped being found, check whether the app was\n' +
        'relinked to a different EAS project: these variables live per-project\n' +
        'and do not transfer. Compare extra.eas.projectId in app.json against\n' +
        'the project you set them on.',
    );
  }

  if (!apiKey) {
    console.warn(
      '[app.config] GOOGLE_MAPS_API_KEY unset — maps will render grey. ' +
        'Add it to apps/customer/.env for local builds.',
    );
  }

  /**
   * Google sign-in client ids, carried to the app through `extra`.
   *
   * **Not `EXPO_PUBLIC_`, deliberately.** These are set in EAS as ordinary
   * (secret) variables, which this file can read and a component cannot — see
   * the note at the top. `extra` is serialised into the app manifest at build
   * time and read back with `expo-constants`, so the same variable works
   * locally from `.env` and on EAS with no prefix and no second name.
   *
   * That does **not** make them secret in the app: `extra` ships inside the
   * binary and is extractable from any APK, exactly as an inlined
   * `EXPO_PUBLIC_` value would be. Nothing can prevent that — the app has to
   * send the id to Google. `Secret` in EAS means "not readable in the UI, CLI
   * or logs", which is a smaller but real thing.
   *
   * Unset platforms are **omitted** rather than set to `null`: Expo's config
   * serialisation turns a `null` here into `{}`, which is truthy and would sail
   * past a naive presence check at the read site. The reader treats anything
   * that is not a non-empty string as unset, so the two agree either way.
   */
  const googleClientIds = Object.fromEntries(
    Object.entries({
      android: process.env.GOOGLE_CLIENT_ID_ANDROID,
      ios: process.env.GOOGLE_CLIENT_ID_IOS,
      web: process.env.GOOGLE_CLIENT_ID_WEB,
    }).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  );

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        ...(apiKey ? { googleMaps: { apiKey } } : {}),
      },
    },
    extra: {
      ...config.extra,
      googleClientIds,
    },
  };
};
