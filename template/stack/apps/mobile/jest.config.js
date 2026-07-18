// jest.config.js — the react-native component/screen half of the unit floor
// (jest-expo preset). PURE mobile modules run under the ROOT vitest config
// instead; the runner split is documented there (vitest.config.ts unit-node).
module.exports = {
  preset: 'jest-expo',
  // pnpm keeps the real packages under node_modules/.pnpm/<pkg>@<v>/node_modules/,
  // so the must-be-transformed lookahead needs `.pnpm` in the set — without it
  // every RN/Expo module is served untranspiled and the suite dies on ESM/JSX
  // syntax (design record: EXPO-FACTS, jest under pnpm). `standard-navigation`
  // (expo-router 57's navigation core) and the @formatjs polyfills ship
  // ESM-only — same treatment.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm|(?:jest-)?react-native|@react-native(?:-community)?|expo(?:nent)?|@expo(?:nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@formatjs/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    // tsc -b emits declaration files (including *.test.d.ts) here.
    '<rootDir>/dist/',
    // LOCKSTEP with the root vitest.config.ts unit-node include list: these
    // suites are pure (zero react-native in their import closure) and run
    // under vitest — ignored here so no test ever runs under both runners.
    '<rootDir>/src/i18n/i18n\\.test\\.ts$',
    '<rootDir>/src/routes\\.test\\.ts$',
    '<rootDir>/src/lib/kv\\.test\\.ts$',
    '<rootDir>/src/lib/sse\\.test\\.ts$',
    '<rootDir>/src/features/actions/fuzzyScore\\.test\\.ts$',
    '<rootDir>/src/features/actions/recents\\.test\\.ts$',
    '<rootDir>/src/features/matrix/matrixData\\.test\\.ts$',
  ],
  // `json` writes coverage/coverage-final.json — the istanbul artifact the
  // diff-coverage step merges with the vitest map (both runners feed one floor).
  coverageReporters: ['json', 'text-summary'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
    // Generated from the styleguide manifest — the regen-diff gate owns it;
    // coverage over generated lines would only dilute the signal.
    '!src/theme/tokens.gen.ts',
  ],
}
