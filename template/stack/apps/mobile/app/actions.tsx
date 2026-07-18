import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { sessionProvider } from '../src/auth/session'
import { AppText } from '../src/components/AppText'
import { EmptyState } from '../src/components/EmptyState'
import { Input } from '../src/components/Input'
import { Screen } from '../src/components/Screen'
import {
  type ActionCommand,
  ACTION_COMMANDS,
  type ActionContext,
  type ActionGroup,
} from '../src/features/actions/registry'
import { rankCommands } from '../src/features/actions/fuzzyScore'
import { pushRecent, readRecents } from '../src/features/actions/recents'
import { type MessageKey, useI18n } from '../src/i18n'
import { ROUTES } from '../src/routes'
import { type Palette, useThemedStyles } from '../src/theme/theme'
import { radius, spacing } from '../src/theme/tokens.gen'

// The actions modal (presented by app/_layout.tsx) — the mobile successor of
// the desktop command palette: a search input over the typed registry, ranked
// by the same deterministic fuzzy scorer, with persisted recents pinned first
// ON THE EMPTY QUERY ONLY (the desktop discipline: the first typed character
// replaces the whole surface with ranked results — recency never biases
// ranking, which stays a pure function of (query, commands)).
//
// STATES HONESTY: the registry is a static in-process array, so `loading` and
// `error` are UNREACHABLE for this route — no fabricated spinner, no fake
// failure. The one truthful data state besides ready is EMPTY: a query that
// matches nothing (its manifest testID lands on that surface). The manifest
// keeps all three ids so the contract stays uniform; the states sweep documents
// the two that cannot occur here.

// ROUTES entry 2 IS the actions entry (id 'actions') — literal-typed testIDs.
const ACTIONS = ROUTES[2]

// The pinned-recents section id. Not an ActionGroup: no command declares itself
// 'recents' — the section is synthesized from storage below.
const RECENTS_SECTION = 'recents'

type SectionId = ActionGroup | typeof RECENTS_SECTION

/** The catalog key for a section header — every `actions.group.*` message is
 *  provably reachable from this one expression. */
function groupLabelKey(id: SectionId): MessageKey {
  return `actions.group.${id}`
}

/** A command with its title RESOLVED for the active locale — what ranking runs over. */
interface ResolvedCommand extends ActionCommand {
  readonly title: string
}

interface Section {
  readonly id: SectionId
  readonly commands: readonly ResolvedCommand[]
}

/** Bucket a (ranked or registration-ordered) list into sections, preserving
 *  order: a group's position is its best (earliest) member's position. */
function groupSections(commands: readonly ResolvedCommand[]): Section[] {
  const sections: { id: SectionId; commands: ResolvedCommand[] }[] = []
  const byId = new Map<SectionId, ResolvedCommand[]>()
  for (const command of commands) {
    const bucket = byId.get(command.group)
    if (bucket === undefined) {
      const fresh = [command]
      byId.set(command.group, fresh)
      sections.push({ id: command.group, commands: fresh })
    } else {
      bucket.push(command)
    }
  }
  return sections
}

// Recents-vs-ranked interplay (the pinned convention): Recents render ONLY on
// the EMPTY query — pinned first, above the grouped full list (a recent command
// also stays in its home group). Recent ids with no live command (a stale
// build's id) are filtered right here, where the live command set is known —
// storage keeps them for a build that has the command back.
function buildSections(
  query: string,
  commands: readonly ResolvedCommand[],
  recentIds: readonly string[],
): readonly Section[] {
  const grouped = groupSections(rankCommands(query, commands))
  if (query !== '') return grouped
  const byId = new Map(commands.map((command) => [command.id, command]))
  const recents = recentIds.flatMap((id) => {
    const command = byId.get(id)
    return command === undefined ? [] : [command]
  })
  if (recents.length === 0) return grouped
  return [{ id: RECENTS_SECTION, commands: recents }, ...grouped]
}

const actionStyles = (palette: Palette) => ({
  list: {
    gap: spacing,
  },
  option: {
    backgroundColor: palette.canvas,
    borderColor: palette.edge,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing * 3,
    paddingVertical: spacing * 2,
  },
  optionPressed: {
    opacity: 0.7,
  },
  sectionHeader: {
    paddingTop: spacing * 2,
  },
})

export default function ActionsModal() {
  const { t } = useI18n()
  const styles = useThemedStyles(actionStyles)
  const [query, setQuery] = useState('')
  // Raw persisted ids, read once at mount; every run keeps this in sync via
  // pushRecent's return value, so no render-time storage read can go stale
  // under the React Compiler's memoization.
  const [recentIds, setRecentIds] = useState(readRecents)

  // Titles resolve HERE, per render — ranking must run over the text the user
  // can see, in the locale they see it in.
  const commands: readonly ResolvedCommand[] = ACTION_COMMANDS.map((command) => ({
    ...command,
    title: t(command.titleKey),
  }))
  const sections = buildSections(query.trim(), commands, recentIds)
  const total = sections.reduce((sum, section) => sum + section.commands.length, 0)

  const context: ActionContext = {
    navigate: (path) => {
      router.navigate(path)
    },
    signOut: async () => {
      await sessionProvider().signOut()
      router.replace('/sign-in')
    },
  }

  const runCommand = (command: ResolvedCommand): void => {
    setRecentIds(pushRecent(command.id))
    // Close the modal FIRST (the desktop original's order), then run — a
    // navigation command must land on the target screen, not under a modal.
    // Guarded: a deep launch straight into /actions has no history to pop.
    if (router.canGoBack()) router.back()
    command.run(context)
  }

  return (
    <Screen testID="actions-screen">
      <AppText variant="title">{t('route.actions')}</AppText>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t('actions.placeholder')}
        accessibilityLabel={t('actions.search')}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        testID="actions-search"
      />
      {total === 0 ? (
        <EmptyState
          testID={ACTIONS.states.empty}
          title={t('actions.noMatch.title')}
          description={t('actions.noMatch.description')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {sections.map((section) => (
            // Fragment-per-section, keyed on the section id; header + options
            // render flat (no wrapper Views for Fabric to flatten).
            <View key={section.id} style={styles.list}>
              <AppText variant="label" role="heading" style={styles.sectionHeader}>
                {t(groupLabelKey(section.id))}
              </AppText>
              {section.commands.map((command) => (
                <Pressable
                  key={`${section.id}:${command.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={command.title}
                  testID={`action-${command.id}`}
                  onPress={() => {
                    runCommand(command)
                  }}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <AppText>{command.title}</AppText>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  )
}
