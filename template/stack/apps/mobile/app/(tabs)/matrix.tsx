import { AppText } from '../../src/components/AppText'
import { EmptyState } from '../../src/components/EmptyState'
import { Screen } from '../../src/components/Screen'
import { useI18n } from '../../src/i18n'
import { ROUTES } from '../../src/routes'

// ROUTES entry 1 IS the matrix entry (id 'matrix') — literal-typed testIDs.
const MATRIX = ROUTES[1]

// Placeholder Matrix screen so src/routes.ts never lies about its file. The
// dense virtualized grid ports in a later workstream; until its query exists,
// EMPTY is the one truthful data state (same honesty rule as Home).
export default function MatrixScreen() {
  const { t } = useI18n()
  return (
    <Screen testID="matrix-screen">
      <AppText variant="title">{t('matrix.heading')}</AppText>
      <EmptyState
        testID={MATRIX.states.empty}
        title={t('matrix.empty.title')}
        description={t('matrix.empty.description')}
      />
    </Screen>
  )
}
