// The host seam — the ONLY module that touches the platform keychain
// (dependency-cruiser rule: secure-store-host-seam-only). expo-secure-store
// keeps the credential in iOS Keychain / Android Keystore, never in JS-visible
// app storage: anything in the JS sandbox (a compromised dependency, an
// injected script in a webview) can read app storage; it cannot read the
// keychain entry of another process.
// SOURCE: the client holds a scoped bearer token only; authorization lives
// server-side on FORCE RLS [corpus: harness/doctrine]
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'access_token'

/**
 * The stored bearer token, or null when signed out. Corrupt-safe (the kv.ts
 * discipline): an unreadable keychain — fresh install, revoked entitlement,
 * jest's mocked native layer — reads as SIGNED OUT, never a boot crash.
 */
export async function secureGetToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Store the bearer token. Deliberately NOT try/caught: a sign-in that cannot
 * persist its token must fail the sign-in, not report success and then read as
 * signed-out on the next launch.
 */
export async function secureSetToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

/** Drop the stored token; absence is the goal, so an unreachable store counts. */
export async function secureDeleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    // Indistinguishable from deleted on the next read.
  }
}
