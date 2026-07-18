// The session seam: ONE provider interface every auth strategy implements, and
// a module-level active provider the router shell installs at boot. Features
// never see a provider — they call the api-client one-door, which pulls the
// token through the resolver installed here.
import { setAccessTokenProvider } from '../lib/api-client'

export interface AccessTokenProvider {
  /** Resolve the current bearer token, or null when signed out. */
  readonly getAccessToken: () => Promise<string | null>
  /**
   * Interactive sign-in; resolves once a token is stored host-side. `hint` is
   * provider-interpreted: the dev stub takes an optional subject uuid (pin the
   * same user across reinstalls); Entra (W4) will take a login_hint.
   */
  readonly signIn: (hint?: string) => Promise<void>
  /** Drop the stored credential. */
  readonly signOut: () => Promise<void>
}

let active: AccessTokenProvider | null = null

/**
 * Install the active provider and wire it into the api-client. Called once from
 * app/_layout.tsx at boot (and by tests with their own fakes) — the shape
 * mirrors setAccessTokenProvider so a forgotten wire still fails loudly on the
 * first request rather than sending a bare one.
 */
export function installSessionProvider(provider: AccessTokenProvider): void {
  active = provider
  setAccessTokenProvider(() => provider.getAccessToken())
}

/** The active provider; throws when boot wiring was skipped (a real bug). */
export function sessionProvider(): AccessTokenProvider {
  if (active === null) {
    throw new Error('no session provider installed — app/_layout.tsx wires one at boot')
  }
  return active
}
