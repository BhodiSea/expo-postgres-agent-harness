#!/usr/bin/env node
// Gate: expo-policy — asserts over the RESOLVED Expo config, the store/security
// surface the app actually ships. Resolution runs through the expo CLI
// (`expo config --json --type public`: dynamic config executed, plugins
// expanded), so the gate needs apps/mobile/node_modules — loud SKIP locally
// without it, FAIL CLOSED in CI; unchanged inputs ride a content stamp. What it
// enforces (never vacuous: the scaffold ships every file it reads, so absence
// is a red, not a shrug):
//   1. store identity matches tools/identity.lock.json — ios.bundleIdentifier
//      == android.package == appIdentifier, scheme, EAS projectId, and
//      updates.url (when present) embeds that projectId; upgrade identity
//      never drifts after first release
//   2. runtimeVersion stays exactly { policy: 'appVersion' } — the
//      deterministic, PR-reviewable OTA compatibility boundary
//   3. engine floor: jsEngine absent-or-hermes, newArchEnabled absent-or-true,
//      useHermesV1 never false (SDK 57 forces the New Architecture on — an
//      explicit opt-out attempt still reds, because it documents wrong intent)
//   4. transport: no NSAllowsArbitraryLoads, ATS exception domains
//      loopback-only, no usesCleartextTraffic anywhere in the resolved config
//      (including an expo-build-properties plugin entry), extra.apiOrigin
//      https-or-loopback
//   5. android.permissions <-> tools/expo-permissions.json, bidirectional
//      (unreviewed grant AND stale entry both red)
//   6. resolved plugins <-> tools/expo-plugins.json, bidirectional, by name
//   7. no secret-shaped KEY in resolved `extra` (extra ships in the bundle by
//      design) and no secret-shaped EXPO_PUBLIC_* name in mobile source —
//      EXPO_PUBLIC_ vars compile into the shipped bundle
//   8. splash + adaptive-icon backgrounds both equal the GENERATED dark canvas
//      token — the native launch frame must paint the same pixel the first
//      React frame paints (anti-flash lockstep)
//   9. eas.json sanity: appVersionSource "local", production implies store
//      distribution, no autoIncrement, no secret-shaped env NAMES
//  10. CNG purity (shared assert): apps/mobile/{android,ios} untracked AND
//      ignored — prebuild output is generated, never committed
// SOURCE: docs/harness/README.md (expo-policy gate) [corpus: harness/doctrine]
import { existsSync, readFileSync } from 'node:fs'
import { cngPurityErrors } from './lib/cng-purity.mjs'
import { walkFiles } from './lib/fs-walk.mjs'
import { fail, failures, ok, runCmd, skipOrFail, stampGate } from './lib/gate.mjs'
import { STAMP_INPUTS } from './lib/stamp-inputs.mjs'

const GATE = 'expo-policy'
const APP = 'apps/mobile'
const CONFIG = `${APP}/app.config.ts`
const LOCK = 'tools/identity.lock.json'
const PERMS_FILE = 'tools/expo-permissions.json'
const PLUGINS_FILE = 'tools/expo-plugins.json'
const TOKENS_FILE = `${APP}/src/theme/tokens.gen.ts`
const EAS_FILE = `${APP}/eas.json`
// The one secret-shape heuristic, shared with the eas.json env-name check and
// the EXPO_PUBLIC_ source scan below.
const SECRET_SHAPE = /(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)/i
const LOOPBACK_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

if (!existsSync(CONFIG)) skipOrFail(GATE, `${CONFIG} not found (no mobile app surface yet)`)
if (!existsSync(`${APP}/node_modules`)) {
  skipOrFail(
    GATE,
    `${APP}/node_modules missing — run pnpm install (config resolution needs the expo CLI)`,
  )
}
if (!existsSync(`${APP}/node_modules/.bin/expo`) && !existsSync('node_modules/.bin/expo')) {
  skipOrFail(
    GATE,
    'expo CLI not installed — run pnpm install (the gate resolves config through it)',
  )
}

// CNG purity runs BEFORE the stamp: git index state is not a hashable stamp
// input, so a freshly-staged native dir must red even on a warm stamp.
failures(GATE, cngPurityErrors())

const recordGreen = stampGate(GATE, STAMP_INPUTS[GATE])

// --type public is the credential-free resolution: what an OTA update or a
// build actually embeds, with EAS-private fields stripped. Package-manager
// banners can precede the JSON on some setups — parse from the first brace.
// SOURCE: https://docs.expo.dev/workflow/configuration/
let cfg
try {
  const out = runCmd('pnpm exec expo config --json --type public', {
    cwd: APP,
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  })
  const start = out.indexOf('{')
  if (start === -1) throw new Error(`no JSON object in output:\n${out.slice(0, 500)}`)
  cfg = JSON.parse(out.slice(start))
} catch (e) {
  const detail = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message
  fail(
    GATE,
    `could not resolve the Expo config (pnpm exec expo config --json --type public in ${APP}):\n${detail.slice(-3000)}`,
  )
}

const errs = []

function readJson(path) {
  if (!existsSync(path)) {
    errs.push(`${path} missing — the scaffold ships it; restore it (this gate is never vacuous)`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    errs.push(`${path} is not valid JSON: ${e.message}`)
    return null
  }
}

// 1. identity lock — equality against the lock, nothing fancier: a fresh
// install may legitimately pin easProjectId "TBD" until `eas init` runs, and
// the lock<->config LOCKSTEP is the invariant, not the value's prettiness.
function checkIdentity() {
  const lock = readJson(LOCK)
  if (lock === null) return
  const pairs = [
    ['ios.bundleIdentifier', cfg.ios?.bundleIdentifier, lock.appIdentifier],
    ['android.package', cfg.android?.package, lock.appIdentifier],
    ['scheme', cfg.scheme, lock.scheme],
    ['extra.eas.projectId', cfg.extra?.eas?.projectId, lock.easProjectId],
  ]
  for (const [site, got, want] of pairs) {
    if (got !== want) {
      errs.push(
        `identity drift: ${site} is ${JSON.stringify(got)} but ${LOCK} pins ${JSON.stringify(want)} — store identity is immutable after first release; changing the lock is a reviewed human act`,
      )
    }
  }
  const updatesUrl = cfg.updates?.url
  if (typeof updatesUrl === 'string' && !updatesUrl.includes(String(lock.easProjectId))) {
    errs.push(
      `updates.url "${updatesUrl}" does not embed the locked EAS projectId ${JSON.stringify(lock.easProjectId)} — an update URL pointing at another project is a hijacked OTA channel`,
    )
  }
}

// 2 + 3. runtime version + engine floor.
function checkEngine() {
  const rv = cfg.runtimeVersion
  const exact =
    rv !== null &&
    typeof rv === 'object' &&
    !Array.isArray(rv) &&
    rv.policy === 'appVersion' &&
    Object.keys(rv).length === 1
  if (!exact) {
    // SOURCE: https://docs.expo.dev/eas-update/runtime-versions/
    errs.push(
      `runtimeVersion must be exactly { "policy": "appVersion" } (got ${JSON.stringify(rv)}) — the deterministic OTA boundary; the fingerprint policy is a computed hash no PR can review (rejected in the design record)`,
    )
  }
  // SOURCE: https://docs.expo.dev/guides/new-architecture/
  if (cfg.newArchEnabled !== undefined && cfg.newArchEnabled !== true) {
    errs.push(
      `newArchEnabled must be absent or true (got ${JSON.stringify(cfg.newArchEnabled)}) — SDK 57 forces the New Architecture on, so an explicit opt-out is dead config documenting the wrong intent`,
    )
  }
  for (const [prefix, obj] of [
    ['', cfg],
    ['ios.', cfg.ios ?? {}],
    ['android.', cfg.android ?? {}],
  ]) {
    if (obj.jsEngine !== undefined && obj.jsEngine !== 'hermes') {
      errs.push(
        `${prefix}jsEngine must be absent or "hermes" (got ${JSON.stringify(obj.jsEngine)}) — Hermes is the measured engine every perf budget assumes`,
      )
    }
    if (obj.useHermesV1 === false) {
      errs.push(
        `${prefix}useHermesV1: false — Hermes V1 is the SDK 57 default and the harness floor; do not opt back out`,
      )
    }
  }
}

// 4. transport policy.
function checkTransport() {
  const ats = cfg.ios?.infoPlist?.NSAppTransportSecurity
  if (ats !== null && typeof ats === 'object') {
    if (ats.NSAllowsArbitraryLoads === true) {
      errs.push(
        'ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads: true — blanket plaintext HTTP is banned; declare loopback NSExceptionDomains for local dev instead',
      )
    }
    for (const domain of Object.keys(ats.NSExceptionDomains ?? {})) {
      if (domain !== 'localhost' && domain !== '127.0.0.1') {
        errs.push(
          `ATS exception domain "${domain}" — exceptions are loopback-only (localhost, 127.0.0.1); a non-loopback API origin must be https`,
        )
      }
    }
  }
  scanCleartext(cfg, '')
  const origin = cfg.extra?.apiOrigin
  if (typeof origin !== 'string' || origin === '') {
    errs.push(
      'extra.apiOrigin missing from the resolved config — the committed transport target the one-door api client dials',
    )
  } else if (!origin.startsWith('https://') && !LOOPBACK_HTTP.test(origin)) {
    errs.push(
      `extra.apiOrigin "${origin}" — must be https:// or loopback http:// (it is committed transport policy and ships in the bundle by design)`,
    )
  }
}

// Deep-walk for android cleartext opt-ins: the key can appear under android.*
// OR inside an expo-build-properties plugin config entry — one recursive scan
// catches both spellings of the same hole.
function scanCleartext(node, path) {
  if (node === null || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    if (k === 'usesCleartextTraffic' && v === true) {
      errs.push(
        `${path}${k}: true — Android cleartext HTTP is banned everywhere in the resolved config; the API origin is https-or-loopback`,
      )
    }
    scanCleartext(v, `${path}${k}.`)
  }
}

// 5. permission allowlist, bidirectional.
function checkPermissions() {
  const file = readJson(PERMS_FILE)
  if (file === null) return
  const reviewed = new Set()
  for (const entry of file.permissions ?? []) {
    if (
      typeof entry?.name !== 'string' ||
      entry.name === '' ||
      typeof entry?.reason !== 'string' ||
      entry.reason.trim() === ''
    ) {
      errs.push(
        `${PERMS_FILE}: entry ${JSON.stringify(entry)} — every permission needs { name, reason } with a non-empty reviewed reason`,
      )
      continue
    }
    reviewed.add(entry.name)
  }
  const resolved = cfg.android?.permissions ?? []
  for (const p of resolved) {
    if (!reviewed.has(p)) {
      errs.push(
        `android.permissions grants "${p}" with no reviewed reason in ${PERMS_FILE} — a permission is a user-facing promise; add the entry in the same reviewed diff`,
      )
    }
  }
  for (const name of reviewed) {
    if (!resolved.includes(name)) {
      errs.push(
        `${PERMS_FILE} lists "${name}" but the resolved config no longer grants it — stale entries are RED so the allowlist can never quietly over-grant`,
      )
    }
  }
}

// 6. plugin allowlist, bidirectional, by name ([name, config] counts as name).
function checkPlugins() {
  const file = readJson(PLUGINS_FILE)
  if (file === null) return
  const reviewed = new Set()
  for (const entry of file.plugins ?? []) {
    if (
      typeof entry?.name !== 'string' ||
      entry.name === '' ||
      typeof entry?.reason !== 'string' ||
      entry.reason.trim() === ''
    ) {
      errs.push(
        `${PLUGINS_FILE}: entry ${JSON.stringify(entry)} — every plugin needs { name, reason } with a non-empty reviewed reason`,
      )
      continue
    }
    reviewed.add(entry.name)
  }
  const resolvedNames = (cfg.plugins ?? [])
    .map((p) => (Array.isArray(p) ? p[0] : p))
    .filter((n) => typeof n === 'string')
  for (const n of resolvedNames) {
    if (!reviewed.has(n)) {
      errs.push(
        `plugin "${n}" resolves but has no entry in ${PLUGINS_FILE} — a config plugin rewrites the generated native project; review it in with a reason`,
      )
    }
  }
  for (const n of reviewed) {
    if (!resolvedNames.includes(n)) {
      errs.push(
        `${PLUGINS_FILE} lists "${n}" but it no longer resolves — stale entry (the lockstep is bidirectional, so the allowlist mirrors reality)`,
      )
    }
  }
}

// 7a. secret-shaped keys in resolved extra. extra ships in the bundle BY
// DESIGN, so a secret-shaped key there is a shipped secret regardless of value.
// The extra.eas subtree is excluded: EAS metadata (projectId) is public — it is
// printed by `eas init` and asserted against the identity lock above.
function scanExtraKeys(node, path) {
  if (node === null || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    if (path === 'extra.' && k === 'eas') continue
    if (SECRET_SHAPE.test(k)) {
      errs.push(
        `resolved ${path}${k} is a secret-shaped key in extra — secrets live server-side or in expo-secure-store, never in the config the bundle embeds`,
      )
    }
    scanExtraKeys(v, `${path}${k}.`)
  }
}

// 7b. secret-shaped EXPO_PUBLIC_* names anywhere in mobile source text.
// EXPO_PUBLIC_ vars are inlined into the shipped JS bundle at build time —
// same failure mode as any client-embedded env, so the same name-shape ban.
// SOURCE: https://docs.expo.dev/guides/environment-variables/
function checkPublicEnvNames() {
  const publicSecret = /EXPO_PUBLIC_[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)[A-Za-z0-9_]*/gi
  const files = [CONFIG]
  for (const root of [`${APP}/src`, `${APP}/app`]) {
    for (const rel of walkFiles(root, {
      filter: (p) => /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(p),
    })) {
      files.push(`${root}/${rel}`)
    }
  }
  for (const f of files) {
    if (!existsSync(f)) continue
    for (const m of readFileSync(f, 'utf8').matchAll(publicSecret)) {
      errs.push(
        `${f}: ${m[0]} — EXPO_PUBLIC_ names compile into the shipped bundle; a secret-shaped name there is a shipped secret`,
      )
    }
  }
}

// 8. splash lockstep: both native launch-frame colors equal the GENERATED dark
// canvas token (parsed textually from the committed tokens module — the gate
// must not import app TS). Unparsable file fails closed rather than guessing.
function checkSplashLockstep() {
  if (!existsSync(TOKENS_FILE)) {
    errs.push(
      `${TOKENS_FILE} missing — cannot verify the launch-frame lockstep (fails closed); run \`node tools/gen-theme.mjs\``,
    )
    return
  }
  const text = readFileSync(TOKENS_FILE, 'utf8')
  const dark = /dark:\s*\{([^}]*)\}/.exec(text)
  const canvas = dark === null ? null : /canvas:\s*'(#[0-9a-fA-F]{3,8})'/.exec(dark[1])
  if (canvas === null) {
    errs.push(
      `could not parse the dark canvas token out of ${TOKENS_FILE} — the lockstep check fails closed rather than guessing a color`,
    )
    return
  }
  const want = canvas[1].toLowerCase()
  const splash = (cfg.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === 'expo-splash-screen',
  )?.[1]
  const sites = [
    ['expo-splash-screen plugin backgroundColor', splash?.backgroundColor],
    ['android.adaptiveIcon.backgroundColor', cfg.android?.adaptiveIcon?.backgroundColor],
  ]
  for (const [site, got] of sites) {
    if (typeof got !== 'string' || got.toLowerCase() !== want) {
      errs.push(
        `${site} is ${JSON.stringify(got)} but the generated dark canvas token is "${want}" — the native launch frame must paint the same pixel the first React frame paints, or every cold start flashes`,
      )
    }
  }
}

// 9. eas.json sanity — the committed build/version surface.
// SOURCE: https://docs.expo.dev/eas/json/
// eslint-disable-next-line sonarjs/cognitive-complexity -- ceiling is machine-enforced by scripts/complexity-ratchet.json (G16); this directive only silences the rule, the ratchet is what stops the score growing
function checkEasJson() {
  const eas = readJson(EAS_FILE)
  if (eas === null) return
  if (eas.cli?.appVersionSource !== 'local') {
    errs.push(
      `${EAS_FILE}: cli.appVersionSource must be "local" — the repo is the version source of truth; a remote counter is a version surface no gate can diff`,
    )
  }
  const prod = eas.build?.production
  if (prod === undefined) {
    errs.push(
      `${EAS_FILE}: build.production profile missing — the store path must be committed and reviewable`,
    )
  } else {
    if (prod.distribution !== undefined && prod.distribution !== 'store') {
      errs.push(
        `${EAS_FILE}: build.production.distribution must be absent or "store" (got ${JSON.stringify(prod.distribution)}) — production implies store distribution`,
      )
    }
    if (prod.autoIncrement !== undefined && prod.autoIncrement !== false) {
      errs.push(
        `${EAS_FILE}: build.production.autoIncrement must be false or absent (got ${JSON.stringify(prod.autoIncrement)}) — remote auto-increment moves versioning off the repo`,
      )
    }
  }
  for (const [profile, def] of Object.entries(eas.build ?? {})) {
    for (const name of Object.keys(def?.env ?? {})) {
      if (SECRET_SHAPE.test(name)) {
        errs.push(
          `${EAS_FILE}: build.${profile}.env.${name} — secret-shaped env NAME in a committed profile; secrets go through \`eas env:*\` with secret visibility, never eas.json`,
        )
      }
    }
  }
}

checkIdentity()
checkEngine()
checkTransport()
checkPermissions()
checkPlugins()
scanExtraKeys(cfg.extra ?? {}, 'extra.')
checkPublicEnvNames()
checkSplashLockstep()
checkEasJson()

failures(GATE, errs)
recordGreen()
ok(
  GATE,
  'identity locked, appVersion runtime, hermes + new-arch floor, transport pinned, permissions/plugins reviewed, no secret-shaped extra, splash lockstep, eas.json sane, CNG pure',
)
