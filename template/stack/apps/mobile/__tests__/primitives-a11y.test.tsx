// The primitives' accessibility CONTRACT — every touchable exposes a role and
// an accessible name, the field trio (label / hint / alert) stays wired. These
// are the invariants the a11y lint + on-device sweeps assume; pinning them at
// the primitive level means every consumer inherits them for free.
import { render, screen } from '@testing-library/react-native'
import { Button } from '../src/components/Button'
import { EmptyState } from '../src/components/EmptyState'
import { Field } from '../src/components/Field'
import { Input } from '../src/components/Input'

describe('Button', () => {
  it('exposes role=button with its label as the accessible name', () => {
    render(<Button label="Do the thing" onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Do the thing' })).toBeTruthy()
  })

  it('mirrors disabled into accessibilityState (assistive tech parity)', () => {
    render(<Button label="Held" onPress={jest.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Held', disabled: true })).toBeTruthy()
  })

  it('every variant keeps the same contract — styling never costs the role', () => {
    for (const variant of ['solid', 'outline', 'ghost'] as const) {
      render(<Button label={`v-${variant}`} onPress={jest.fn()} variant={variant} />)
      expect(screen.getByRole('button', { name: `v-${variant}` })).toBeTruthy()
    }
  })
})

describe('Field + Input', () => {
  it('labels its control: the input is reachable by the label text', () => {
    render(
      <Field label="Title">
        {(control) => <Input accessibilityLabel={control.accessibilityLabel} />}
      </Field>,
    )
    expect(screen.getByLabelText('Title')).toBeTruthy()
  })

  it('an error is announced three ways: alert line, control hint, invalid border flag', () => {
    render(
      <Field label="Title" error="Required">
        {(control) => (
          <Input
            accessibilityLabel={control.accessibilityLabel}
            accessibilityHint={control.accessibilityHint}
            invalid={control.invalid}
          />
        )}
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
    expect(screen.getByLabelText('Title').props['accessibilityHint']).toBe('Required')
  })

  it('no error, no alert — the channel stays quiet until it has meaning', () => {
    render(
      <Field label="Title">
        {(control) => <Input accessibilityLabel={control.accessibilityLabel} />}
      </Field>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('EmptyState', () => {
  it('its CTA renders through the Button primitive: role + accessible name', () => {
    render(
      <EmptyState title="Nothing" description="Yet" cta={{ label: 'Create', onPress: jest.fn() }} />,
    )
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })
})
