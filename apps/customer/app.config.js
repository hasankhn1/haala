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
      'GOOGLE_MAPS_API_KEY is not set for this EAS build.\n' +
        'Set it with: eas env:set --name GOOGLE_MAPS_API_KEY --value <key> ' +
        '--environment preview --environment production',
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
