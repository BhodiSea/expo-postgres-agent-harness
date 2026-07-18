import { router } from 'expo-router'
import { useState } from 'react'
import { sessionProvider } from '../src/auth/session'
import { AppText } from '../src/components/AppText'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { Input } from '../src/components/Input'
import { Screen } from '../src/components/Screen'
import { useI18n } from '../src/i18n'
import { translateError } from '../src/i18n/errors'

// Dev sign-in — the stub provider's screen (the boot wiring in app/_layout.tsx
// installs the stub only under __DEV__; production auth is the W4 Entra flow,
// which replaces this screen's role entirely). Chrome, not content: no entry in
// src/routes.ts (see the manifest's chrome note).
//
// The optional subject uuid pins the SAME dev user across reinstalls (the
// server mints a fresh uuid per token otherwise) — validated inline BEFORE any
// request, through the Field/Input three-channel error contract.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function SignInScreen() {
  const { t } = useI18n()
  const [subject, setSubject] = useState('')
  const [subjectError, setSubjectError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const signIn = async (): Promise<void> => {
    const trimmed = subject.trim()
    if (trimmed !== '' && !UUID_SHAPE.test(trimmed)) {
      setSubjectError(t('signin.subject.invalid'))
      return
    }
    setSubjectError(undefined)
    setFailure(null)
    setPending(true)
    try {
      await sessionProvider().signIn(trimmed === '' ? undefined : trimmed)
      router.replace('/')
    } catch (cause) {
      // Envelope code -> translated copy; the raw message stays a detail.
      setFailure(translateError(cause).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen testID="sign-in-screen">
      <AppText variant="title">{t('signin.title')}</AppText>
      <AppText variant="muted">{t('signin.body')}</AppText>
      <Field label={t('signin.subject.label')} error={subjectError}>
        {(control) => (
          <Input
            value={subject}
            onChangeText={setSubject}
            placeholder={t('signin.subject.placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={control.accessibilityLabel}
            accessibilityHint={control.accessibilityHint}
            invalid={control.invalid}
            testID="sign-in-subject"
          />
        )}
      </Field>
      {failure !== null && (
        <AppText variant="danger" role="alert" testID="sign-in-failure">
          {failure}
        </AppText>
      )}
      <Button
        label={pending ? t('signin.pending') : t('signin.submit')}
        disabled={pending}
        onPress={() => {
          void signIn()
        }}
        testID="sign-in-submit"
      />
    </Screen>
  )
}
