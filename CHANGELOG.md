# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-07-18

Initial development release, under construction: the sibling
`tauri-postgres-agent-harness` ported workstream by workstream to Expo
(React Native) + Hono + Postgres 16 (FORCE RLS) monorepos deployed via EAS
Build/Submit to the Apple App Store and Google Play. Nothing below is claimed
beyond what the repo's own checks verify.

### Added

- Repository bootstrap: installer CLI and repo self-check machinery ported
  from the sibling harness (syntax, hygiene leak-scan + placeholder closure,
  REUSE structural mirror, dead-code, machinery eslint/tsc, complexity
  ratchet).
- The consumer gate chain: `tools/harness.config.mjs` defines the 21 floor
  gates (format, gate-integrity, types, lint, provenance, expo-policy,
  native-deps, version-sync, prompts, licenses, schema-rls, migrations,
  contracts, dead-code, architecture, build, styleguide, perf-budget,
  route-manifest, e2e, docs-sync) plus the Stop-chain extras (RLS isolation,
  vitest + jest-expo unit suites, diff-coverage over the merged maps,
  duplication, i18n, test-quality, mobile-perf closure). The chain replaces
  the desktop sibling's platform gates with mobile ones: expo-policy
  (identity lock, ATS/cleartext, permissions/plugins allowlists, CNG purity,
  secret-shaped `extra` ban, splash-color lockstep, eas.json sanity),
  native-deps (`expo install --check` + config-plugin allowlist), and the
  mobile-perf route ↔ Maestro flow ↔ startup-budget closure.
- The CI floor snapshot: `template/base/tools/validate.floor.json` generated
  and lockstep-checked by `scripts/generate-floor.mjs` — CI treats the frozen
  snapshot as authoritative, so a locally-weakened config cannot weaken CI.
- Machinery self-checks wired into this repo's CI (W5a):
  `scripts/check-rule-integrity.mjs` + `scripts/rule-integrity.json` (G28 —
  the shipped depcruise forbidden rules/scan options hashed and the shipped
  eslint config text pinned, so a deleted, narrowed, or severity-flipped
  boundary rule reds; blocking in the lint workflow's machinery job);
  `scripts/check-claims.mjs` (G12 — README/CHANGELOG quantitative claims
  recomputed from the sources of truth, timing figures may not contradict;
  blocking in the hygiene workflow; the canary-count class activates when the
  canary registry lands with the test wave); and
  `scripts/check-release-lockstep.mjs` (one version across package.json, the
  plugin manifest, every hook's `HARNESS_HOOK_VERSION` stamp, CITATION.cff,
  and this file).
- Complexity-ratchet coverage extended over the ported template machinery:
  measured records for `template/base/tools/lib/agent-roster.mjs`
  (`parseFrontmatter` 29), `template/base/tools/lib/jsonc.mjs`
  (`parseJsonc` 24), and `template/base/tools/check-expo-policy.mjs`
  (`checkEasJson` 16), each carrying the matching inline disable whose
  ceiling the ratchet enforces.
- The test wave (W5b): `tests/gates/` (fixture-driven can-fail proofs
  spawning every real gate, including the new mobile gates), `tests/hooks/`
  (the hook I/O fail-closed contract plus a behavioral deny/allow canary for
  every one of the 72 guard-rule ids, closure asserted bidirectionally),
  and the restored installer lifecycle/graduate suites. The canary registry
  `tests/canary/injections.json` covers every VALIDATE ∪ STOP step (30 in
  total) and every shipped quality-gate CI lane, with W6 PORT NOTEs for the
  device-lane wall-clock canaries that cannot exist before the emulator
  lanes; `scripts/check-canary-coverage.mjs` enforces gate↔canary lockstep
  (stale or missing proofs red, every proof file executed and structurally
  non-empty) and runs in the selftest matrix on both OSes. The selftest
  workflow gains the `canary` job (a real installed scaffold: 16 injections,
  each inject → gate red → revert → green, plus the RLS runner's no-database
  fail-closed proof) and the `canary-mutation` job (an untested branch in a
  fully-mutation-covered file leaves vitest, jest, diff-coverage and
  test-quality green while only the mutation ratchet reds). Installer
  coverage floors raised to 85/74/91 (measured 91.6/80.2/95.2) with a second
  floor over `template/base/tools/lib/**` at 88/82/78. The SSE suite gains a
  parser-edge kill corpus and a mock-ReadableStream pump corpus, cutting the
  committed mutation baseline from 54 accepted survivors to 25 (663 mutants,
  638 killed; every remaining survivor carries a reviewed
  genuinely-equivalent or lane-ownership reason).
