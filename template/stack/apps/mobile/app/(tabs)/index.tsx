import { useEffect } from 'react'
import { AppText } from '../../src/components/AppText'
import { EmptyState } from '../../src/components/EmptyState'
import { Screen } from '../../src/components/Screen'
import { useI18n } from '../../src/i18n'
import { stampBootTiming } from '../../src/lib/boot-timing'
import { ROUTES } from '../../src/routes'

// ROUTES is a literal tuple; entry 0 IS the home entry (id 'home') — indexing
// keeps the states testIDs literal-typed instead of widening through a find().
const HOME = ROUTES[0]

// Placeholder Home screen — the real notes feature lands next workstream.
// Honest minimalism: with no query yet, EMPTY is the only truthful data state,
// so only states.empty renders; states.loading/states.error arm when the list
// query exists (the route-manifest gate will then hold all three).
export default function HomeScreen() {
  const { t } = useI18n()
  useEffect(() => {
    // First screen on-screen == interactive: the one honest place to stamp
    // cold-start (stamp-once; see src/lib/boot-timing.ts).
    stampBootTiming()
  }, [])
  return (
    <Screen testID="home-screen">
      <AppText variant="title">{t('home.title')}</AppText>
      <AppText variant="muted">{t('home.body')}</AppText>
      <EmptyState
        testID={HOME.states.empty}
        title={t('home.empty.title')}
        description={t('home.empty.description')}
      />
    </Screen>
  )
}
