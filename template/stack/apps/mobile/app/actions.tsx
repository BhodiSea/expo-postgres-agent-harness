import { AppText } from '../src/components/AppText'
import { EmptyState } from '../src/components/EmptyState'
import { Screen } from '../src/components/Screen'
import { useI18n } from '../src/i18n'
import { ROUTES } from '../src/routes'

// ROUTES entry 2 IS the actions entry (id 'actions') — literal-typed testIDs.
const ACTIONS = ROUTES[2]

// The actions modal (presented by app/_layout.tsx) — the mobile successor of
// the desktop command palette: screens will contribute typed actions here in a
// later workstream. Until a contribution registry exists, EMPTY is the one
// truthful data state.
export default function ActionsModal() {
  const { t } = useI18n()
  return (
    <Screen testID="actions-screen">
      <AppText variant="title">{t('route.actions')}</AppText>
      <EmptyState
        testID={ACTIONS.states.empty}
        title={t('actions.empty.title')}
        description={t('actions.empty.description')}
      />
    </Screen>
  )
}
