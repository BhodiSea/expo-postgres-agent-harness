// Can-fail proofs for the expo-policy gate (template/base/tools/check-expo-policy.mjs).
// The gate asserts over the RESOLVED Expo config, which it obtains by running
// `pnpm exec expo config --json --type public` in apps/mobile — so every fixture
// plants (a) a stub apps/mobile/node_modules/.bin/expo (the gate requires the CLI
// path to exist) and (b) a fake `pnpm` shim prepended to PATH that prints a canned
// resolved-config JSON (with a package-manager banner ahead of it: the gate parses
// from the first brace). The shim ships a .cmd twin for the Windows selftest
// matrix. CNG purity reads `git ls-files`, so fixtures are REAL scratch git repos.
// The data files (identity lock, permission/plugin allowlists, eas.json, the
// generated tokens module) are the SHIPPED templates, mutated per case.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(
  new URL('../../template/base/tools/check-expo-policy.mjs', import.meta.url),
)
const SHIPPED_PERMS = readFileSync(
  fileURLToPath(new URL('../../template/base/tools/expo-permissions.json', import.meta.url)),
  'utf8',
)
const SHIPPED_PLUGINS = readFileSync(
  fileURLToPath(new URL('../../template/base/tools/expo-plugins.json', import.meta.url)),
  'utf8',
)
const SHIPPED_EAS = readFileSync(
  fileURLToPath(new URL('../../template/stack/apps/mobile/eas.json', import.meta.url)),
  'utf8',
)
const SHIPPED_TOKENS = readFileSync(
  fileURLToPath(
    new URL('../../template/stack/apps/mobile/src/theme/tokens.gen.ts', import.meta.url),
  ),
  'utf8',
)

// The dark canvas token, parsed exactly the way the gate parses it — so the
// fixtures' launch-frame colors track the shipped palette instead of a literal.
const DARK_CANVAS = (() => {
  const dark = /dark:\s*\{([^}]*)\}/.exec(SHIPPED_TOKENS)
  const canvas = dark === null ? null : /canvas:\s*'(#[0-9a-fA-F]{3,8})'/.exec(dark[1])
  assert.ok(canvas, 'the shipped tokens module must carry a parsable dark canvas token')
  return canvas[1].toLowerCase()
})()

const LOCK = {
  appIdentifier: 'com.example.app',
  scheme: 'exampleapp',
  easProjectId: 'ab12cd34-0000-4000-8000-1234567890ab',
}

// A resolved config that satisfies every rule against the fixture lock + the
// shipped allowlists (loopback ATS exceptions included, to pin their legality).
function baseConfig() {
  return {
    name: 'Example',
    slug: 'example',
    scheme: LOCK.scheme,
    version: '0.1.0',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: LOCK.appIdentifier,
      buildNumber: '0.1.0',
      infoPlist: {
        NSAppTransportSecurity: {
          NSExceptionDomains: { localhost: {}, '127.0.0.1': {} },
        },
      },
    },
    android: {
      package: LOCK.appIdentifier,
      versionCode: 1000,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: DARK_CANVAS },
    },
    runtimeVersion: { policy: 'appVersion' },
    updates: { url: `https://u.expo.dev/${LOCK.easProjectId}` },
    extra: {
      apiOrigin: 'https://api.example.com',
      eas: { projectId: LOCK.easProjectId },
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-localization',
      ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: DARK_CANVAS }],
    ],
  }
}

function configWith(mutate) {
  const c = baseConfig()
  mutate(c)
  return c
}

// The fake package manager (see check-native-deps.test.mjs for the pattern): node
// implements the behavior; sh + .cmd wrappers make it PATH-callable everywhere.
const IMPL = `import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const spec = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'behavior.json'), 'utf8'),
)
const args = process.argv.slice(2).join(' ')
if (args.includes('expo config')) {
  if (spec.banner) console.log(spec.banner)
  console.log(JSON.stringify(spec.config))
  process.exit(0)
}
console.error('fake pnpm: unexpected invocation: ' + args)
process.exit(1)
`

function writeShims(dir, behavior) {
  const bin = join(dir, 'fakebin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'impl.mjs'), IMPL)
  writeFileSync(join(bin, 'behavior.json'), JSON.stringify(behavior))
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/impl.mjs" "$@"\n`,
  )
  chmodSync(join(bin, 'pnpm'), 0o755)
  writeFileSync(join(bin, 'pnpm.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0impl.mjs" %*\r\n`)
}

function git(dir, ...args) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`)
}

const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))

/** @param {{ config?: any, banner?: string, lock?: any, perms?: any, pluginsFile?: any, eas?: any, tokens?: any, nodeModules?: boolean, sources?: Record<string, string>, gitignore?: string }} [opts] */
function fixture({
  config = baseConfig(),
  banner = 'Scope: all 5 workspace projects',
  lock = LOCK,
  perms = SHIPPED_PERMS,
  pluginsFile = SHIPPED_PLUGINS,
  eas = SHIPPED_EAS,
  tokens = SHIPPED_TOKENS,
  nodeModules = true,
  sources = {},
  gitignore = 'node_modules/\napps/mobile/android/\napps/mobile/ios/\n',
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'epah-expopolicy-'))
  mkdirSync(join(dir, 'apps/mobile/src/theme'), { recursive: true })
  mkdirSync(join(dir, 'tools'), { recursive: true })
  writeFileSync(
    join(dir, 'apps/mobile/app.config.ts'),
    '// resolved by the fake expo CLI in this fixture\nexport default {}\n',
  )
  if (nodeModules) {
    mkdirSync(join(dir, 'apps/mobile/node_modules/.bin'), { recursive: true })
    writeFileSync(join(dir, 'apps/mobile/node_modules/.bin/expo'), '')
  }
  if (lock !== null) writeFileSync(join(dir, 'tools/identity.lock.json'), asText(lock))
  if (perms !== null) writeFileSync(join(dir, 'tools/expo-permissions.json'), asText(perms))
  if (pluginsFile !== null) writeFileSync(join(dir, 'tools/expo-plugins.json'), asText(pluginsFile))
  if (eas !== null) writeFileSync(join(dir, 'apps/mobile/eas.json'), asText(eas))
  if (tokens !== null) writeFileSync(join(dir, 'apps/mobile/src/theme/tokens.gen.ts'), asText(tokens))
  writeFileSync(join(dir, '.gitignore'), gitignore)
  for (const [rel, content] of Object.entries(sources)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  git(dir, 'init', '-q')
  writeShims(dir, { config, banner })
  return dir
}

function runGate(dir, { ci = true } = {}) {
  const env = { ...process.env }
  delete env.CI
  delete env.HARNESS_REQUIRE_TOOLCHAINS
  delete env.GITHUB_BASE_REF
  if (ci) env.CI = 'true'
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = `${join(dir, 'fakebin')}${delimiter}${env[pathKey] ?? ''}`
  const res = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8', env })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

// ---- baseline -------------------------------------------------------------------

test('GREEN: a lock-true resolved config passes every rule (banner before the JSON tolerated)', () => {
  const r = runGate(fixture())
  assert.equal(r.code, 0, r.out)
  assert.ok(r.out.includes('expo-policy: OK'), r.out)
  assert.ok(r.out.includes('identity locked, appVersion runtime'), r.out)
})

// ---- 1. identity lock -----------------------------------------------------------

test('RED: identity drift names the site, both values, and the immutability doctrine', () => {
  const r = runGate(
    fixture({ config: configWith((c) => (c.android.package = 'com.evil.other')) }),
  )
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('identity drift: android.package is "com.evil.other"'), r.out)
  assert.ok(r.out.includes(`tools/identity.lock.json pins "${LOCK.appIdentifier}"`), r.out)
  assert.ok(r.out.includes('immutable after first release'), r.out)
})

test('RED: an updates.url that does not embed the locked EAS projectId is a hijacked OTA channel', () => {
  const r = runGate(
    fixture({ config: configWith((c) => (c.updates.url = 'https://u.expo.dev/someone-else')) }),
  )
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('does not embed the locked EAS projectId'), r.out)
  assert.ok(r.out.includes('hijacked OTA channel'), r.out)
})

test('RED: a missing or unreadable identity lock is never vacuous', () => {
  const missing = runGate(fixture({ lock: null }))
  assert.equal(missing.code, 1, missing.out)
  assert.ok(
    missing.out.includes('tools/identity.lock.json missing — the scaffold ships it'),
    missing.out,
  )

  const broken = runGate(fixture({ lock: '{ nope' }))
  assert.equal(broken.code, 1, broken.out)
  assert.ok(broken.out.includes('tools/identity.lock.json is not valid JSON'), broken.out)
})

// ---- 2 + 3. runtime version + engine floor ---------------------------------------

test('RED: runtimeVersion must be EXACTLY { policy: "appVersion" } — string and extra-key forms red', () => {
  const str = runGate(fixture({ config: configWith((c) => (c.runtimeVersion = '1.2.3')) }))
  assert.equal(str.code, 1, str.out)
  assert.ok(str.out.includes('runtimeVersion must be exactly { "policy": "appVersion" }'), str.out)
  assert.ok(str.out.includes('(got "1.2.3")'), str.out)

  const extraKey = runGate(
    fixture({
      config: configWith((c) => (c.runtimeVersion = { policy: 'appVersion', fingerprint: true })),
    }),
  )
  assert.equal(extraKey.code, 1, extraKey.out)
  assert.ok(extraKey.out.includes('runtimeVersion must be exactly'), extraKey.out)
})

test('RED: newArchEnabled: false is dead config documenting the wrong intent', () => {
  const r = runGate(fixture({ config: configWith((c) => (c.newArchEnabled = false)) }))
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('newArchEnabled must be absent or true (got false)'), r.out)
})

test('RED: a non-hermes jsEngine reds at every site, and useHermesV1: false reds', () => {
  const top = runGate(fixture({ config: configWith((c) => (c.jsEngine = 'jsc')) }))
  assert.equal(top.code, 1, top.out)
  assert.ok(top.out.includes('jsEngine must be absent or "hermes" (got "jsc")'), top.out)

  const android = runGate(fixture({ config: configWith((c) => (c.android.jsEngine = 'jsc')) }))
  assert.equal(android.code, 1, android.out)
  assert.ok(android.out.includes('android.jsEngine must be absent or "hermes"'), android.out)

  const hermesV1 = runGate(fixture({ config: configWith((c) => (c.ios.useHermesV1 = false)) }))
  assert.equal(hermesV1.code, 1, hermesV1.out)
  assert.ok(hermesV1.out.includes('ios.useHermesV1: false — Hermes V1 is the SDK 57 default'), hermesV1.out)
})

// ---- 4. transport ---------------------------------------------------------------

test('RED: NSAllowsArbitraryLoads is banned outright', () => {
  const r = runGate(
    fixture({
      config: configWith(
        (c) => (c.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads = true),
      ),
    }),
  )
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('NSAllowsArbitraryLoads: true — blanket plaintext HTTP is banned'), r.out)
})

test('RED: a non-loopback ATS exception domain reds (loopback ones pass in the GREEN case)', () => {
  const r = runGate(
    fixture({
      config: configWith((c) => {
        c.ios.infoPlist.NSAppTransportSecurity.NSExceptionDomains['api.internal.example'] = {}
      }),
    }),
  )
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('ATS exception domain "api.internal.example"'), r.out)
  assert.ok(r.out.includes('loopback-only'), r.out)
})

test('RED: usesCleartextTraffic reds anywhere — android.* AND inside a plugins entry', () => {
  const direct = runGate(
    fixture({ config: configWith((c) => (c.android.usesCleartextTraffic = true)) }),
  )
  assert.equal(direct.code, 1, direct.out)
  assert.ok(direct.out.includes('android.usesCleartextTraffic: true'), direct.out)

  // Inside an expo-build-properties entry: the deep walk must find it. The plugin
  // gets an allowlist row so THIS red (not the plugin lockstep) is what fires.
  const pluginsFile = JSON.parse(SHIPPED_PLUGINS)
  pluginsFile.plugins.push({ name: 'expo-build-properties', reason: 'test fixture' })
  const nested = runGate(
    fixture({
      pluginsFile,
      config: configWith((c) =>
        c.plugins.push(['expo-build-properties', { android: { usesCleartextTraffic: true } }]),
      ),
    }),
  )
  assert.equal(nested.code, 1, nested.out)
  assert.ok(nested.out.includes('plugins.4.1.android.usesCleartextTraffic: true'), nested.out)
  assert.ok(nested.out.includes('Android cleartext HTTP is banned everywhere'), nested.out)
})

test('extra.apiOrigin: missing and non-https red; loopback http is GREEN', () => {
  const missing = runGate(fixture({ config: configWith((c) => delete c.extra.apiOrigin) }))
  assert.equal(missing.code, 1, missing.out)
  assert.ok(missing.out.includes('extra.apiOrigin missing from the resolved config'), missing.out)

  const plaintext = runGate(
    fixture({ config: configWith((c) => (c.extra.apiOrigin = 'http://api.internal.example')) }),
  )
  assert.equal(plaintext.code, 1, plaintext.out)
  assert.ok(plaintext.out.includes('must be https:// or loopback http://'), plaintext.out)

  const loopback = runGate(
    fixture({ config: configWith((c) => (c.extra.apiOrigin = 'http://localhost:8787')) }),
  )
  assert.equal(loopback.code, 0, loopback.out)
})

// ---- 5. permission allowlist, bidirectional --------------------------------------

test('permissions: an unreviewed grant reds, a reviewed one greens, a stale entry reds', () => {
  const grant = configWith((c) => (c.android.permissions = ['android.permission.CAMERA']))
  const unreviewed = runGate(fixture({ config: grant }))
  assert.equal(unreviewed.code, 1, unreviewed.out)
  assert.ok(
    unreviewed.out.includes(
      'android.permissions grants "android.permission.CAMERA" with no reviewed reason',
    ),
    unreviewed.out,
  )

  const perms = JSON.parse(SHIPPED_PERMS)
  perms.permissions.push({ name: 'android.permission.CAMERA', reason: 'scan QR codes on join' })
  const reviewed = runGate(fixture({ config: grant, perms }))
  assert.equal(reviewed.code, 0, reviewed.out)

  const stale = runGate(fixture({ perms }))
  assert.equal(stale.code, 1, stale.out)
  assert.ok(
    stale.out.includes('lists "android.permission.CAMERA" but the resolved config no longer grants it'),
    stale.out,
  )
})

test('RED: a reasonless permission entry is a gate bypass, named verbatim', () => {
  const perms = JSON.parse(SHIPPED_PERMS)
  perms.permissions.push({ name: 'android.permission.CAMERA', reason: '  ' })
  const r = runGate(fixture({ perms }))
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('every permission needs { name, reason }'), r.out)
})

// ---- 6. plugin allowlist, bidirectional ------------------------------------------

test('plugins: an unreviewed [name, config] entry reds by NAME; a stale allowlist row reds', () => {
  const unreviewed = runGate(
    fixture({ config: configWith((c) => c.plugins.push(['expo-camera', { mode: 'auto' }])) }),
  )
  assert.equal(unreviewed.code, 1, unreviewed.out)
  assert.ok(
    unreviewed.out.includes('plugin "expo-camera" resolves but has no entry in tools/expo-plugins.json'),
    unreviewed.out,
  )

  const pluginsFile = JSON.parse(SHIPPED_PLUGINS)
  pluginsFile.plugins.push({ name: 'expo-image-picker', reason: 'was reviewed once' })
  const stale = runGate(fixture({ pluginsFile }))
  assert.equal(stale.code, 1, stale.out)
  assert.ok(
    stale.out.includes('tools/expo-plugins.json lists "expo-image-picker" but it no longer resolves'),
    stale.out,
  )
})

// ---- 7. secret shapes ------------------------------------------------------------

test('RED: a secret-shaped KEY in resolved extra is a shipped secret; extra.eas is exempt', () => {
  const r = runGate(
    fixture({ config: configWith((c) => (c.extra.SUPER_API_KEY = 'not-even-a-real-one')) }),
  )
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('resolved extra.SUPER_API_KEY is a secret-shaped key in extra'), r.out)

  // The EAS metadata subtree is public by design — a secret-shaped name under it
  // must NOT red (it is printed by `eas init` and asserted against the lock).
  const exempt = runGate(
    fixture({ config: configWith((c) => (c.extra.eas.previewToken = 'public-metadata')) }),
  )
  assert.equal(exempt.code, 0, exempt.out)
})

test('RED: a secret-shaped EXPO_PUBLIC_* name in mobile source reds naming file and var', () => {
  const r = runGate(
    fixture({
      sources: {
        'apps/mobile/src/lib/env.ts': 'export const k = process.env.EXPO_PUBLIC_API_TOKEN\n',
      },
    }),
  )
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('apps/mobile/src/lib/env.ts: EXPO_PUBLIC_API_TOKEN'), r.out)
  assert.ok(r.out.includes('compile into the shipped bundle'), r.out)
})

// ---- 8. splash lockstep ----------------------------------------------------------

test('RED: splash and adaptive-icon backgrounds must EQUAL the generated dark canvas token', () => {
  const splash = runGate(
    fixture({
      config: configWith((c) => (c.plugins[3][1].backgroundColor = '#000000')),
    }),
  )
  assert.equal(splash.code, 1, splash.out)
  assert.ok(
    splash.out.includes(
      `expo-splash-screen plugin backgroundColor is "#000000" but the generated dark canvas token is "${DARK_CANVAS}"`,
    ),
    splash.out,
  )

  const icon = runGate(
    fixture({
      config: configWith((c) => (c.android.adaptiveIcon.backgroundColor = '#ffffff')),
    }),
  )
  assert.equal(icon.code, 1, icon.out)
  assert.ok(icon.out.includes('android.adaptiveIcon.backgroundColor is "#ffffff"'), icon.out)
})

test('RED: an unparsable or missing tokens module fails CLOSED — the lockstep never guesses', () => {
  const unparsable = runGate(fixture({ tokens: 'export const palettes = 42\n' }))
  assert.equal(unparsable.code, 1, unparsable.out)
  assert.ok(
    unparsable.out.includes('could not parse the dark canvas token out of apps/mobile/src/theme/tokens.gen.ts'),
    unparsable.out,
  )

  const missing = runGate(fixture({ tokens: null }))
  assert.equal(missing.code, 1, missing.out)
  assert.ok(
    missing.out.includes('apps/mobile/src/theme/tokens.gen.ts missing — cannot verify the launch-frame lockstep'),
    missing.out,
  )
})

// ---- 9. eas.json sanity ----------------------------------------------------------

test('RED: eas.json sanity — remote version source, internal production, autoIncrement, secret env NAME', () => {
  const easWith = (mutate) => {
    const e = JSON.parse(SHIPPED_EAS)
    mutate(e)
    return e
  }

  const remote = runGate(fixture({ eas: easWith((e) => (e.cli.appVersionSource = 'remote')) }))
  assert.equal(remote.code, 1, remote.out)
  assert.ok(remote.out.includes('cli.appVersionSource must be "local"'), remote.out)

  const noProd = runGate(fixture({ eas: easWith((e) => delete e.build.production) }))
  assert.equal(noProd.code, 1, noProd.out)
  assert.ok(noProd.out.includes('build.production profile missing'), noProd.out)

  const internal = runGate(
    fixture({ eas: easWith((e) => (e.build.production.distribution = 'internal')) }),
  )
  assert.equal(internal.code, 1, internal.out)
  assert.ok(
    internal.out.includes('build.production.distribution must be absent or "store" (got "internal")'),
    internal.out,
  )

  const autoInc = runGate(
    fixture({ eas: easWith((e) => (e.build.production.autoIncrement = true)) }),
  )
  assert.equal(autoInc.code, 1, autoInc.out)
  assert.ok(
    autoInc.out.includes('build.production.autoIncrement must be false or absent (got true)'),
    autoInc.out,
  )

  const secretEnv = runGate(
    fixture({ eas: easWith((e) => (e.build.production.env = { SENTRY_TOKEN: 'oops' })) }),
  )
  assert.equal(secretEnv.code, 1, secretEnv.out)
  assert.ok(
    secretEnv.out.includes('build.production.env.SENTRY_TOKEN — secret-shaped env NAME'),
    secretEnv.out,
  )
})

// ---- never vacuous: the data files the gate reads must exist ----------------------

test('RED: missing allowlist / eas files are restore-it reds, never silent passes', () => {
  for (const [key, name] of [
    ['perms', 'tools/expo-permissions.json'],
    ['pluginsFile', 'tools/expo-plugins.json'],
    ['eas', 'apps/mobile/eas.json'],
  ]) {
    const r = runGate(fixture({ [key]: null }))
    assert.equal(r.code, 1, `${name}: ${r.out}`)
    assert.ok(
      r.out.includes(`${name} missing — the scaffold ships it; restore it (this gate is never vacuous)`),
      `${name}: ${r.out}`,
    )
  }
})

// ---- 10. CNG purity --------------------------------------------------------------

test('RED: a git-tracked apps/mobile/android file is committed native output (purity beats resolution)', () => {
  const dir = fixture()
  mkdirSync(join(dir, 'apps/mobile/android'), { recursive: true })
  writeFileSync(join(dir, 'apps/mobile/android/build.gradle'), '// prebuild output\n')
  git(dir, 'add', '-f', 'apps/mobile/android/build.gradle')
  const r = runGate(dir)
  assert.equal(r.code, 1, r.out)
  assert.ok(r.out.includes('apps/mobile/android/build.gradle is committed native output'), r.out)
})

// ---- skip asymmetry --------------------------------------------------------------

test('skip asymmetry: apps/mobile/node_modules missing → loud local SKIP, CI fail-closed', () => {
  const dir = fixture({ nodeModules: false })
  const local = runGate(dir, { ci: false })
  assert.equal(local.code, 0, local.out)
  assert.ok(local.out.includes('SKIPPED'), local.out)
  assert.ok(local.out.includes('node_modules missing'), local.out)
  const ci = runGate(dir, { ci: true })
  assert.equal(ci.code, 1, ci.out)
  assert.ok(ci.out.includes('skips are not allowed in CI'), ci.out)
})
