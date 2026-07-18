// app.config.ts — the single source of every version/identity surface.
// DERIVATION IS THE LOCKSTEP MECHANISM: version, ios.buildNumber and
// android.versionCode are all computed from package.json, so they cannot
// drift; the version-sync gate re-computes the same formulas and asserts
// equality (a consumer replacing them with literals goes red on the next
// bump). eas.json pins appVersionSource: "local" + autoIncrement: false —
// a remote counter would be a version surface no gate can diff.
// SOURCE: docs/harness/README.md (version lockstep doctrine)
import pkg from './package.json'

const [major = 0, minor = 0, patch = 0] = pkg.version.split('.').map(Number)

// versionCode must ascend monotonically for Play; maj*1e6 + min*1e3 + pat does
// while semver ascends, and stays decodable by eye. The version-sync gate errs
// loudly as minor/patch approach the 999 bound.
const versionCode = major * 1_000_000 + minor * 1_000 + patch

export default {
  expo: {
    name: '{{PROJECT_NAME}}',
    slug: '{{PROJECT_SLUG}}',
    scheme: '{{APP_SCHEME}}',
    version: pkg.version,
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    // Store identity — locked in tools/identity.lock.json; the expo-policy gate
    // asserts both sides equal the lock. Immutable after first release.
    ios: {
      bundleIdentifier: '{{APP_IDENTIFIER}}',
      buildNumber: pkg.version,
      supportsTablet: true,
    },
    android: {
      package: '{{APP_IDENTIFIER}}',
      versionCode,
    },
    // OTA compatibility boundary: an update can only reach the exact store
    // version it was exported against. Deterministic and PR-reviewable, unlike
    // the fingerprint policy (a computed hash) — see design record.
    runtimeVersion: { policy: 'appVersion' },
    extra: {
      // The committed transport target — the expo-policy gate asserts it is
      // https or loopback. Never a secret (it ships in the bundle by design).
      apiOrigin: '{{API_ORIGIN}}',
      eas: {
        projectId: '{{EAS_PROJECT_ID}}',
      },
    },
    plugins: ['expo-router', 'expo-secure-store'],
  },
}
