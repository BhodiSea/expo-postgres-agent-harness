// The message catalog — the ONE place user-facing copy lives.
//
// Every string the UI shows is a key here. That is not a style preference: a literal in a
// component is a string no translator can reach, no reviewer can find, and no gate can see.
// The i18n gate reds on a hardcoded user-facing literal anywhere under apps/mobile/src, and
// the pseudo-locale lane proves it behaviourally — under `en-XA` every catalog string is
// visibly mangled, so any plain-English text still on screen is, by construction, a string
// that bypassed this file.
//
// SHAPE. A message is either a plain string or a plural set keyed by CLDR category. `t()`
// picks the category with Intl.PluralRules for the ACTIVE locale, so "1 row" / "2 rows" is
// the language's rule, not English's — a language with a dual or a paucal form gets its own
// branch by adding the key, with no code change.
//
// PLACEHOLDERS are `{name}`. Numbers interpolated through them are formatted with
// Intl.NumberFormat, so a thousands separator is the locale's, not a hardcoded comma.
// SOURCE: Unicode CLDR plural rules — the categories Intl.PluralRules selects between
// https://cldr.unicode.org/index/cldr-spec/plural-rules

/** A plural set. `other` is required — it is the fallback for every category a locale lacks. */
interface PluralMessage {
  readonly zero?: string
  readonly one?: string
  readonly two?: string
  readonly few?: string
  readonly many?: string
  readonly other: string
}

export type Message = string | PluralMessage

export const en = {
  // ---- shell ------------------------------------------------------------------
  'route.home': 'Home',
  'route.matrix': 'Matrix',
  'route.actions': 'Actions',

  // ---- common -----------------------------------------------------------------
  'common.reload': 'Try again',

  // ---- home -------------------------------------------------------------------
  'home.title': 'Ready to build',
  'home.body':
    'This shell wires the stack end to end: the API one-door client, a keychain-backed session, the locale and theme stores, and a typed route manifest. Replace this card with your first screen.',
  'home.empty.title': 'No notes yet',
  'home.empty.description': 'The first note you create will appear here.',

  // ---- matrix -----------------------------------------------------------------
  'matrix.heading': 'Matrix',
  'matrix.empty.title': 'No rows to chart yet',
  'matrix.empty.description':
    'Once notes exist, their numeric columns appear here as a dense, virtualized matrix.',
  // Plural on the ROW count — "1 rows" must be unconstructable.
  'matrix.summary': {
    one: '{rows} row × {columns} columns, virtualized.',
    other: '{rows} rows × {columns} columns, virtualized.',
  },

  // ---- actions ----------------------------------------------------------------
  'actions.empty.title': 'No actions yet',
  'actions.empty.description': 'Actions contributed by the active screen will appear here.',

  // ---- sign-in (dev) ----------------------------------------------------------
  'signin.title': 'Sign in',
  'signin.body':
    'Development sign-in: mints a local token from the API server’s stub authority. Production auth (Entra) replaces this screen.',
  'signin.subject.label': 'Dev subject (optional)',
  'signin.subject.placeholder': 'uuid — blank mints a fresh user',
  'signin.subject.invalid': 'Must be a uuid (8-4-4-4-12 hex) or blank.',
  'signin.submit': 'Sign in (dev)',
  'signin.pending': 'Signing in…',

  // ---- not found --------------------------------------------------------------
  'notFound.title': 'Screen not found',
  'notFound.body': 'That link does not match any screen in this app.',
  'notFound.home': 'Go home',

  // ---- connection -------------------------------------------------------------
  'connection.connected': 'API connected (v{version})',

  // ---- errors -----------------------------------------------------------------
  'error.title': 'Something went wrong',
  'error.body': 'An unexpected error occurred while rendering this screen.',
  // The server's error envelope carries a stable `code` — THAT is what the client
  // localizes. The server's English `message` is a developer detail (and a support
  // reference), never the sentence a user is asked to read.
  'error.api.bad_request': 'That request was not valid.',
  'error.api.unauthorized': 'You are not signed in.',
  'error.api.not_found': 'That item no longer exists.',
  'error.api.payload_too_large': 'That is too large to send.',
  'error.api.version_skew': 'This app is out of date — update to continue.',
  'error.api.internal': 'Something went wrong on the server.',
  'error.api.unknown': 'The request failed ({status}).',
  'error.api.offline': 'Could not reach the server.',
} as const satisfies Record<string, Message>

export type MessageKey = keyof typeof en
export type Catalog = Readonly<Record<MessageKey, Message>>
