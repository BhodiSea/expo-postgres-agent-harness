// Sign-in flow over the real screen + the real stub provider, with BOTH seams
// substituted at their boundaries: the host keychain is mocked in-memory (the
// test asserts AT the seam — token in, token out — not against SecureStore
// internals), and the network runs through the mock server, so the shipped
// api-client code (origin, auth:false mint, envelope decoding) still executes.
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { secureGetToken } from '../src/host'
import { t } from '../src/i18n'
import { installMockServer, uninstallMockServer } from '../src/testing/mock-server'

jest.mock('../src/host', () => {
  let token: string | null = null
  return {
    secureGetToken: jest.fn(async () => token),
    secureSetToken: jest.fn(async (next: string) => {
      token = next
    }),
    secureDeleteToken: jest.fn(async () => {
      token = null
    }),
  }
})

const DEV_TOKEN = 'header.payload.signature-dev'
const DEV_USER = '3f2c8f2a-0000-4000-8000-000000000001'

afterEach(() => {
  uninstallMockServer()
})

describe('dev sign-in', () => {
  it('mints a token from the stub authority, stores it host-side, and returns home', async () => {
    const mint = jest.fn(() => ({ status: 201, body: { token: DEV_TOKEN, userId: DEV_USER } }))
    installMockServer({ 'POST /auth/dev-token': mint })

    renderRouter('./app', { initialUrl: '/sign-in' })
    fireEvent.press(await screen.findByTestId('sign-in-submit'))

    expect(await screen.findByTestId('home-empty')).toBeTruthy()
    expect(mint).toHaveBeenCalledTimes(1)
    await expect(secureGetToken()).resolves.toBe(DEV_TOKEN)
  })

  it('an invalid dev subject shows the inline field error and sends NOTHING', async () => {
    const mint = jest.fn(() => ({ status: 201, body: { token: DEV_TOKEN, userId: DEV_USER } }))
    installMockServer({ 'POST /auth/dev-token': mint })

    renderRouter('./app', { initialUrl: '/sign-in' })
    fireEvent.changeText(await screen.findByLabelText(t('signin.subject.label')), 'not-a-uuid')
    fireEvent.press(screen.getByTestId('sign-in-submit'))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mint).not.toHaveBeenCalled()
  })

  it('a failed mint surfaces TRANSLATED copy from the envelope code, as role=alert', async () => {
    installMockServer({
      'POST /auth/dev-token': () => ({
        status: 500,
        body: { error: { code: 'internal', message: 'boom' } },
      }),
    })

    renderRouter('./app', { initialUrl: '/sign-in' })
    fireEvent.press(await screen.findByTestId('sign-in-submit'))

    const failure = await screen.findByTestId('sign-in-failure')
    // The catalog copy for the stable code — never the server's raw "boom".
    expect(failure).toHaveTextContent(t('error.api.internal'))
  })
})
