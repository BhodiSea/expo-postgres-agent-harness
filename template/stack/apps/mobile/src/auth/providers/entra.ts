// PORT NOTE (W4): the production AccessTokenProvider — Microsoft Entra ID via
// expo-auth-session (PKCE authorization-code flow against the tenant authority
// from .env, refresh handled through the same seam, tokens stored host-side via
// src/host, `hint` forwarded as login_hint).
//
// Deliberately NOT implemented here: a fake implementation would let a build
// wire a provider that cannot authenticate anyone and read as signed-in
// plumbing. Until W4 lands, this module only fixes the seam's shape — the
// factory throws so a release build fails at boot, loudly, instead of shipping
// an unauthenticated session.
import type { AccessTokenProvider } from '../session'

export function createEntraProvider(): AccessTokenProvider {
  throw new Error(
    'Entra auth provider lands in W4 (expo-auth-session PKCE) — development builds use the stub provider',
  )
}
