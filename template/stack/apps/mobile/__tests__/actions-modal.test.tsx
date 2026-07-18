// Actions modal — ranking, sections, recents pinning, and command execution
// through the REAL router (renderRouter: running a navigation command closes
// the modal and lands on the target screen). Storage: src/lib/kv is mocked
// in-memory (the native kv-store is absent under jest and the corrupt-safe kv
// would silently read empty — the recents behavior needs a store that works).
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library'
import { en } from '../src/i18n/catalog'
import { installMockServer, uninstallMockServer } from '../src/testing/mock-server'

const { kvBacking } = jest.requireMock('../src/lib/kv') as { kvBacking: Map<string, string> }

jest.mock('../src/lib/kv', () => {
  const kvBacking = new Map<string, string>()
  return {
    kvBacking,
    kvGet: (key: string) => kvBacking.get(key) ?? null,
    kvSet: (key: string, value: string) => {
      kvBacking.set(key, value)
    },
    kvDelete: (key: string) => {
      kvBacking.delete(key)
    },
  }
})

jest.mock('../src/host', () => ({
  secureGetToken: jest.fn(async () => 'jest-session-token'),
  secureSetToken: jest.fn(async () => undefined),
  secureDeleteToken: jest.fn(async () => undefined),
  secureGetRefreshToken: jest.fn(async () => null),
  secureSetRefreshToken: jest.fn(async () => undefined),
  secureDeleteRefreshToken: jest.fn(async () => undefined),
}))

const RECENTS_KEY = 'actions.recents'

const emptyPage = () => ({ status: 200, body: { items: [], nextCursor: null } })
const HEALTH = () => ({ status: 200, body: { ok: true as const, version: '0.0.0' } })

// Every screen a command can land on fetches — cover the whole route surface.
function installAppNetwork(): void {
  installMockServer({
    'GET /healthz': HEALTH,
    'GET /api/notes': emptyPage,
    'GET /api/notes?limit=50': emptyPage,
  })
}

beforeEach(() => {
  kvBacking.clear()
})

afterEach(() => {
  uninstallMockServer()
})

function optionTitles(): readonly string[] {
  return screen
    .getAllByTestId(/^action-/)
    .map((option) => (option.props['accessibilityLabel'] ?? '') as string)
}

describe('actions modal sections + ranking', () => {
  it('renders group headers and commands in registration order on the empty query', async () => {
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    await screen.findByTestId('actions-screen')

    expect(screen.getByText(en['actions.group.navigation'])).toBeTruthy()
    expect(screen.getByText(en['actions.group.notes'])).toBeTruthy()
    expect(screen.getByText(en['actions.group.session'])).toBeTruthy()
    expect(optionTitles()).toEqual([
      en['command.goHome'],
      en['command.goMatrix'],
      en['command.createNote'],
      en['command.signOut'],
    ])
  })

  it('re-ranks as the user types — pinned in fuzzyScore.test.ts: boundary hits beat scattered', async () => {
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    fireEvent.changeText(await screen.findByTestId('actions-search'), 'tm')

    expect(optionTitles()).toEqual([en['command.goMatrix'], en['command.goHome']])
    // Groups with no surviving member disappear.
    expect(screen.queryByText(en['actions.group.session'])).toBeNull()
  })

  it('shows the empty state when nothing matches — the route manifest testID lands here', async () => {
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    fireEvent.changeText(await screen.findByTestId('actions-search'), 'zzzz')

    expect(await screen.findByTestId('actions-empty')).toBeTruthy()
    expect(screen.queryAllByTestId(/^action-/)).toHaveLength(0)
  })
})

describe('actions modal recents', () => {
  it('pins a Recents section first on the empty query, duplicating the command in its home group', async () => {
    kvBacking.set(RECENTS_KEY, JSON.stringify(['session.signOut']))
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    await screen.findByTestId('actions-screen')

    expect(screen.getByText(en['actions.group.recents'])).toBeTruthy()
    // The recent command renders twice — under Recents AND its home group.
    expect(screen.getAllByTestId('action-session.signOut')).toHaveLength(2)
    // Recents lead the surface: the first rendered option is the recent one.
    expect(optionTitles()[0]).toBe(en['command.signOut'])
  })

  it('replaces Recents with ranked results as soon as the user types', async () => {
    kvBacking.set(RECENTS_KEY, JSON.stringify(['session.signOut']))
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    fireEvent.changeText(await screen.findByTestId('actions-search'), 'go')

    expect(screen.queryByText(en['actions.group.recents'])).toBeNull()
    fireEvent.changeText(screen.getByTestId('actions-search'), '')
    expect(await screen.findByText(en['actions.group.recents'])).toBeTruthy()
  })

  it('filters recents ids whose command no longer exists (stale build) without dropping storage', async () => {
    kvBacking.set(RECENTS_KEY, JSON.stringify(['ghost.command', 'nav.home']))
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    await screen.findByText(en['actions.group.recents'])

    // Only the live command surfaces; the ghost id stays in storage untouched.
    expect(screen.getAllByTestId('action-nav.home')).toHaveLength(2)
    expect(JSON.parse(kvBacking.get(RECENTS_KEY) ?? 'null')).toEqual(['ghost.command', 'nav.home'])
  })

  it('running a command records it at the front of the persisted recents', async () => {
    kvBacking.set(RECENTS_KEY, JSON.stringify(['nav.home']))
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })

    fireEvent.press((await screen.findAllByTestId('action-nav.matrix'))[0]!)

    await waitFor(() => {
      expect(JSON.parse(kvBacking.get(RECENTS_KEY) ?? 'null')).toEqual(['nav.matrix', 'nav.home'])
    })
  })

  it('survives a corrupt recents payload without a Recents section', async () => {
    kvBacking.set(RECENTS_KEY, '[[[corrupt')
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })
    await screen.findByTestId('actions-screen')

    expect(screen.queryByText(en['actions.group.recents'])).toBeNull()
  })
})

describe('actions modal commands', () => {
  it('a navigation command closes the modal and lands on its target screen', async () => {
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })

    fireEvent.press((await screen.findAllByTestId('action-nav.matrix'))[0]!)

    expect(await screen.findByTestId('matrix-screen')).toBeTruthy()
  })

  it('create-note lands on Home with the composer focused', async () => {
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })

    fireEvent.press((await screen.findAllByTestId('action-notes.create'))[0]!)

    const input = await screen.findByTestId('note-composer-input')
    // The ?focus=composer param forwards as the input's autoFocus.
    expect(input.props['autoFocus'] as boolean).toBe(true)
  })

  it('sign-out drops the session and returns to the sign-in screen', async () => {
    installAppNetwork()
    renderRouter('./app', { initialUrl: '/actions' })

    fireEvent.press((await screen.findAllByTestId('action-session.signOut'))[0]!)

    expect(await screen.findByTestId('sign-in-screen')).toBeTruthy()
  })
})
