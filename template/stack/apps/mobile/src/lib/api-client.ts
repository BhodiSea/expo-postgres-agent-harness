import { ApiError } from '@app/contracts'
import Constants from 'expo-constants'

// THE one door to the API server. Every request the app makes goes through
// apiFetch — origin, bearer token, and error-envelope decoding live here and nowhere
// else, so an authenticated call is what an agent gets by DEFAULT rather than
// something it must remember to assemble at each call site.
//
// Why this module exists: in the source harness each feature once called `fetch()`
// directly with only a content-type header. Against the real server every one of them
// 401s — and nothing caught it, because every unit test and e2e lane mocks the
// network. The seam between the two halves of the app was the one surface no gate
// exercised.
//
// The token is INJECTED (app/_layout.tsx wires the session provider from src/auth),
// not read here: it lives in the platform keychain behind src/host, never in
// JS-visible app storage (readable by anything running in the JS sandbox) and never
// behind an EXPO_PUBLIC_ name (inlined into the shipped bundle by design — fine for
// the origin below, fatal for a credential).
// SOURCE: the API server on FORCE RLS is the authorization boundary; the client is
// an untrusted bearer of a scoped token [corpus: harness/doctrine]

// Metro inlines EXPO_PUBLIC_ vars by rewriting the literal member expression
// `process.env.EXPO_PUBLIC_API_ORIGIN` at bundle time — a bracket read would stay a
// runtime lookup of an object the shipped bundle does not carry, so DOT access is
// load-bearing here. The local declaration types exactly that one property (the RN
// globals leave process.env untyped for our purposes).
declare const process: { readonly env: { readonly EXPO_PUBLIC_API_ORIGIN?: string } }

// Dev override via EXPO_PUBLIC_ env; otherwise the committed transport target from
// app.config.ts `extra.apiOrigin` (the expo-policy gate asserts it stays
// https-or-loopback). Declared ONCE — a second copy is how a screen ends up talking
// to the wrong origin.
//
// `||`, NOT `??`: a SET-BUT-EMPTY var must fall back too. `??` only catches
// null/undefined, so a bare `EXPO_PUBLIC_API_ORIGIN=` line (.env.example ships
// exactly that line) yields '', every request silently becomes a relative path, and
// the failures read as a server fault. The same nullish-vs-empty confusion once
// disabled audience validation outright in apps/server/src/auth/verify.ts. Empty
// means unset.
const configOrigin: unknown = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[
  'apiOrigin'
]
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- here `??` IS the bug, not the fix: it passes '' through as the origin. The rule is right in general and wrong here.
const API_ORIGIN: string =
  process.env.EXPO_PUBLIC_API_ORIGIN || (typeof configOrigin === 'string' ? configOrigin : '')

/** Resolves the bearer token, or null when the session is unauthenticated. */
type AccessTokenResolver = () => Promise<string | null>

// Unauthenticated until wired. app/_layout.tsx installs the session-backed resolver
// at startup; the unit suites install their own. A forgotten wire therefore fails
// LOUDLY on the first request (UnauthenticatedError) instead of silently sending a
// bare one and reading as a server fault.
let tokenResolver: AccessTokenResolver = () => Promise.resolve(null)

/** Install the token source. Called once at startup (and by tests). */
export function setAccessTokenProvider(next: AccessTokenResolver): void {
  tokenResolver = next
}

/**
 * A failed API call, carrying the server envelope's own message. The server speaks ONE
 * error shape (`{ error: { code, message, requestId } }`) — decoding it in one place is
 * what lets every surface show the real reason, and quote a requestId, instead of a bare
 * status code.
 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null

  constructor(message: string, status: number, code: string | null, requestId: string | null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

/** No token: the request is never sent. A bare request 401s and reads as a server fault. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('not signed in')
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Decode the server's error envelope. A non-envelope body (a proxy's HTML 502, a
 * truncated response) still yields a usable message rather than a parse crash.
 */
async function envelopeError(response: Response): Promise<ApiRequestError> {
  try {
    const { error } = ApiError.parse(await response.json())
    return new ApiRequestError(error.message, response.status, error.code, error.requestId ?? null)
  } catch {
    return new ApiRequestError(
      `request failed (${String(response.status)})`,
      response.status,
      null,
      null,
    )
  }
}

export interface ApiFetchInit extends RequestInit {
  /** Liveness probes (/healthz) and the dev-token mint are the only unauthenticated calls. */
  readonly auth?: boolean
}

/**
 * Fetch against the API. Attaches `Authorization: Bearer <token>` unless `auth: false`,
 * and REJECTS rather than sending an unauthenticated request. Non-2xx responses throw an
 * ApiRequestError carrying the envelope message, so call sites branch on failure once.
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { auth = true, headers, ...rest } = init
  const merged = new Headers(headers)

  if (auth) {
    const token = await tokenResolver()
    if (token === null || token === '') throw new UnauthenticatedError()
    merged.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_ORIGIN}${path}`, { ...rest, headers: merged })
  if (!response.ok) throw await envelopeError(response)
  return response
}

/** apiFetch + a JSON body, with the content-type the server's zod validator requires. */
export async function apiPost(
  path: string,
  body: unknown,
  init: ApiFetchInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return apiFetch(path, { ...init, method: 'POST', headers, body: JSON.stringify(body) })
}
