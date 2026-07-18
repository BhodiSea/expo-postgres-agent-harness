# expo-postgres-agent-harness

A deterministic agent harness for **Expo (React Native) + Hono + Drizzle /
Postgres 16 (FORCE RLS)** pnpm monorepos, shipped to the **Apple App Store and
Google Play via EAS Build/Submit** — installable into any new or existing
project.

> **Status: pre-release (0.1.x under construction).** This is the mobile
> sibling of
> [`tauri-postgres-agent-harness`](https://github.com/BhodiSea/tauri-postgres-agent-harness),
> ported workstream by workstream. The README grows as the gates land; nothing
> is claimed here that the selftest matrix does not prove.

## What it is

An npm-installable CLI + Claude Code plugin that scaffolds an Expo + Hono +
Postgres monorepo and installs three enforcement layers into it:

1. **Agent-time hooks** — a Claude Code `Stop` hook that refuses to end a turn
   until the validation chain, RLS isolation tests, and unit suites pass.
2. **Commit-time checks** — lefthook + commitlint + gitleaks.
3. **CI** — the same validation chain, fail-closed, plus device lanes
   (Android emulator + Maestro) and release automation (release-please +
   EAS Build/Submit with honest degrade when credentials are absent).

## Install

```sh
npx --yes github:BhodiSea/expo-postgres-agent-harness init
```

## Layout

- `installer/` — the CLI (`init`, `update`, `doctor`, `enable`, `graduate`).
  Zero runtime dependencies.
- `template/base/` — the harness machinery installed into a consumer: gate
  scripts, Claude Code hooks/agents/rules, CI workflows (stored dotless),
  db bootstrap, RLS/migration test harnesses.
- `template/stack/` — the reference app: `apps/mobile` (Expo + expo-router),
  `apps/server` (Hono + Drizzle over Postgres FORCE RLS),
  `packages/{contracts,schema,importer,eval}`.
- `template/modules/` — opt-in modules (EAS release automation, EAS Update,
  store metadata, device e2e, crash reporting, observability, …).
- `scripts/`, `tests/` — the harness holding itself to its own bar.

## License

Apache-2.0 for the repository; everything under `template/**` is
"Apache-2.0 OR 0BSD" (recipients choose either — the scaffolded code carries
no attribution requirement).
