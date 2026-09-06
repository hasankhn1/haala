/**
 * Dynamic app config.
 *
 * `app.json` stays the static source of truth — Expo passes its contents in as
 * `config`, and this file only layers on what must come from the environment.
 * Right now that's the Google Maps key, which must not be committed.
 *
 * Where GOOGLE_MAPS_API_KEY comes from:
 *   local  → `apps/customer/.env` (gitignored; Expo CLI loads it before this runs)
 *   EAS    → an EAS environment variable, loaded via the build profile's
 *            `environment` field in eas.json
 *
 * Android only. `DeliveryMap` uses `PROVIDER_DEFAULT`, which is Google Maps on
 * Android but **Apple Maps** on iOS — iOS needs no key unless we switch it to
 * PROVIDER_GOOGLE.
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

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        ...(apiKey ? { googleMaps: { apiKey } } : {}),
      },
    },
  };
};
