// jest.setup.ts — RNTL configuration applied before every suite.
//
// asyncUtilTimeout bounds every findBy*/waitFor. The library default is 1000ms,
// calibrated for developer hardware; on a 2-core CI runner that is ALSO hosting
// an Android emulator and a Metro server (the maestro-smoke canary runs the
// jest lane against the injected tree while both are alive), expo-router's
// first async mount alone can exceed it — layout-boot then reds with a tree
// dump showing only <RNCSafeAreaProvider />, the mid-mount state, not a real
// failure. 10s is headroom, not slack: a genuinely-missing element still fails
// (slower), a present one resolves the instant it appears.
// SOURCE: docs/harness/gates-catalog.md ("e2e") [corpus: harness/doctrine]
import { configure } from '@testing-library/react-native'

configure({ asyncUtilTimeout: 10_000 })
