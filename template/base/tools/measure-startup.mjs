#!/usr/bin/env node
// tools/measure-startup.mjs — the MEASUREMENT half of the mobile-perf floor: cold-start
// every ROUTES entry on the lane emulator and write artifacts/perf-results.json, the
// artifact `HARNESS_PERF_LANE=1 node tools/check-mobile-perf.mjs` enforces against
// tools/startup-budget.json. This script MEASURES and RECORDS; the gate JUDGES — the
// split keeps the budget arithmetic (and its fail-closed rules) in exactly one place.
//
// Per route: `adb shell am force-stop <appId>` (a true cold start, not a resume),
// `adb logcat -c` (so a Fully-drawn line can only come from THIS start), then
// `adb shell am start -W -a android.intent.action.VIEW -d <scheme>://<path> <appId>` —
// the -W TotalTime is approximately the logcat Displayed TTID (design record:
// CI-LANE-FACTS). fullyDrawnMs is recorded only when the app actually called
// reportFullyDrawn() (`adb logcat -d` → "Fully drawn <appId>/…: +1s54ms"); the shipped
// app does not call it yet, so its absence is honest — check-mobile-perf enforces a
// fullyDrawn cap only for budget rows that declare one.
//
// One measured start per route, deliberately: the budgets are GENEROUS step-function
// detectors (see startup-budget.json's doctrine), and N-run medians would spend lane
// minutes to sharpen a number the gate never reads finely.
// SOURCE: https://developer.android.com/topic/performance/vitals/launch-time (am start -W / TTID / reportFullyDrawn)
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { fail, MAX_BUFFER, ok, skipOrFail } from './lib/gate.mjs'
import { deepLink, parseRoutes, readAppIdentity } from './lib/mobile-app-meta.mjs'

const GATE = 'measure-startup'
const ROUTES_FILE = 'apps/mobile/src/routes.ts'
const IDENTITY_LOCK = 'tools/identity.lock.json'
const RESULTS = 'artifacts/perf-results.json'
// The launch itself is bounded by -W; this bounds a wedged adb.
const ADB_TIMEOUT_MS = 3 * 60 * 1000

const quoted = (s) => JSON.stringify(String(s))
function sh(command) {
  return spawnSync(command, {
    shell: true, // adb resolves as adb.exe everywhere, but the test suite's stub is a .cmd shim on Windows
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: ADB_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
}

function adbOrDie(command, context) {
  const res = sh(command)
  if (res.error !== undefined || res.status !== 0) {
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
    console.error(out.split('\n').slice(-30).join('\n'))
    fail(
      GATE,
      `${context}: \`${command}\` failed — no device answer means no measurement, and an unmeasured lane must red, never skip`,
    )
  }
  return res.stdout ?? ''
}

/** "Fully drawn <pkg>/...: +1s54ms" -> 1054 (ms); null when the app never reported. */
export function parseFullyDrawnMs(logcat, appId) {
  const line = logcat
    .split('\n')
    .reverse()
    .find((l) => l.includes('Fully drawn') && l.includes(appId))
  if (line === undefined) return null
  const m = line.match(/\+(?:(\d+)s)?(\d+)ms/)
  if (m === null) return null
  return Number(m[1] ?? '0') * 1000 + Number(m[2])
}

/** The -W block's "TotalTime: <ms>" — the cold-start number the budgets cap. */
export function parseTotalTimeMs(amOutput) {
  const m = amOutput.match(/^TotalTime:\s*(\d+)\s*$/m)
  return m === null ? null : Number(m[1])
}

// Import-safe: the parsers above are unit-tested by importing this module; the
// measurement run only starts when invoked as a script.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  let routes
  let identity
  try {
    routes = parseRoutes(ROUTES_FILE)
    identity = readAppIdentity(IDENTITY_LOCK)
  } catch (e) {
    fail(GATE, e instanceof Error ? e.message : String(e))
  }

  const probe = sh('adb get-state')
  if (probe.error !== undefined || probe.status !== 0 || !(probe.stdout ?? '').includes('device')) {
    skipOrFail(GATE, 'no adb device answers — the startup measurement needs the lane emulator')
  }

  /** @type {Record<string, { totalTimeMs: number, fullyDrawnMs?: number }>} */
  const screens = {}
  for (const route of routes) {
    const uri = deepLink(identity.scheme, route.path)
    adbOrDie(`adb shell am force-stop ${quoted(identity.appId)}`, route.id)
    adbOrDie('adb logcat -c', route.id)
    const out = adbOrDie(
      `adb shell am start -W -a android.intent.action.VIEW -d ${quoted(uri)} ${quoted(identity.appId)}`,
      route.id,
    )
    const totalTimeMs = parseTotalTimeMs(out)
    if (totalTimeMs === null) {
      console.error(out.split('\n').slice(-20).join('\n'))
      fail(
        GATE,
        `route '${route.id}': \`am start -W\` printed no TotalTime — the launch did not complete (wrong appId? unresolved deep link ${uri}?), so this screen is UNMEASURED and the lane must red`,
      )
    }
    // A short settle so a reportFullyDrawn() fired just after the -W return still
    // lands (HARNESS_SETTLE_MS trims it in the stub-adb test harness).
    const settleMs = Number(process.env.HARNESS_SETTLE_MS ?? '') || 2000
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, settleMs)
    const fullyDrawnMs = parseFullyDrawnMs(sh('adb logcat -d').stdout ?? '', identity.appId)
    screens[route.id] = fullyDrawnMs === null ? { totalTimeMs } : { totalTimeMs, fullyDrawnMs }
    console.log(
      `${GATE}: ${route.id.padEnd(16)} TotalTime ${String(totalTimeMs).padStart(6)}ms${fullyDrawnMs === null ? '' : `  fully-drawn ${String(fullyDrawnMs)}ms`}`,
    )
  }

  mkdirSync(dirname(RESULTS), { recursive: true })
  writeFileSync(RESULTS, `${JSON.stringify({ screens }, null, 2)}\n`)
  ok(
    GATE,
    `${String(routes.length)} route(s) cold-started; wrote ${RESULTS} (enforce with: HARNESS_PERF_LANE=1 node tools/check-mobile-perf.mjs)`,
  )
}
