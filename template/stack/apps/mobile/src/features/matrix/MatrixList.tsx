import { FlatList, View } from 'react-native'
import { AppText } from '../../components/AppText'
import { formatCellValue, useI18n } from '../../i18n'
import { type Palette, useThemedStyles } from '../../theme/theme'
import { spacing, typeScale } from '../../theme/tokens.gen'
import type { MatrixColumn, MatrixRow } from './matrixData'

// The dense list — the RN successor of the desktop original's virtualized grid.
// PORT NOTE: the DOM grid hand-rolled its virtual window (useVirtualWindow) and
// a roving-tabindex keyboard model (useRovingGrid); neither survives the port —
// FlatList IS the virtualizer on this host (getItemLayout + windowSize below are
// its tuning), and there is no hardware-keyboard surface in the base app, so the
// arrow-key roving model has nothing to bind to. What DOES survive: fixed row
// height shared between layout and the virtualizer's math, deterministic cell
// formatting through the locale (formatCellValue), and the accessibility
// contract — every row is one accessible element with a role and a label, so
// assistive tech walks rows, never 7 000 bare text nodes.
//
// Pagination is announced, not implied: the list carries an accessibilityHint
// telling AT users that scrolling to the end loads more (PORT-SPEC: the mobile
// e2e lane asserts the hint), and the screen renders an explicit Load-more
// button as the reachable equivalent of the near-end scroll trigger.

// Row height in dp — getItemLayout's contract with the styles below. A drifted
// pair would make FlatList scroll to the wrong offsets, so it is ONE constant.
export const MATRIX_ROW_HEIGHT = 36

// FlatList tuning: ~7 viewports of rows kept warm (the default 21 is tuned for
// media feeds; dense 36dp rows make that thousands of mounted Texts), small
// initial mount, batched appends.
const WINDOW_SIZE = 7
const INITIAL_ROWS = 16
const BATCH_ROWS = 24
// Ask for the next page when the last rendered viewport-half approaches —
// mirrors the desktop grid's NEAR_END_ROWS trigger.
const END_REACHED_THRESHOLD = 0.5

interface MatrixListProps {
  readonly rows: readonly MatrixRow[]
  readonly columns: readonly MatrixColumn[]
  /** Near-end scroll trigger — loadMore itself single-flights repeats. */
  readonly onEndReached: () => void
}

const listStyles = (palette: Palette) => ({
  list: {
    borderColor: palette.edge,
    borderRadius: spacing,
    borderWidth: 1,
    flexGrow: 0,
  },
  row: {
    alignItems: 'center' as const,
    borderBottomColor: palette.edge,
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    gap: spacing * 2,
    height: MATRIX_ROW_HEIGHT,
    paddingHorizontal: spacing * 3,
  },
  label: {
    color: palette['ink-muted'],
    flex: 2,
    fontSize: typeScale.sm.fontSize,
  },
  cell: {
    color: palette['ink-muted'],
    flex: 1,
    fontSize: typeScale.sm.fontSize,
    // Literal-element array (not `as const`): RN's TextStyle wants a MUTABLE
    // FontVariant[]. tabular-nums keeps the numeric columns from jittering.
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  headerCell: {
    color: palette.ink,
    fontWeight: '600' as const,
  },
})

export function MatrixList({ rows, columns, onEndReached }: MatrixListProps) {
  const { t } = useI18n()
  const styles = useThemedStyles(listStyles)
  return (
    <FlatList
      testID="matrix-list"
      accessibilityLabel={t('matrix.list')}
      // The pagination announcement (see the header comment): AT users must be
      // told the list grows at its end — the visual near-end trigger is silent.
      accessibilityHint={t('matrix.pagination.hint')}
      style={styles.list}
      data={rows}
      keyExtractor={(row) => row.id}
      // Fixed-height rows let FlatList place any index without measuring —
      // scroll-to and window math stay O(1) at 10 000 rows.
      getItemLayout={(_data, index) => ({
        length: MATRIX_ROW_HEIGHT,
        offset: MATRIX_ROW_HEIGHT * index,
        index,
      })}
      windowSize={WINDOW_SIZE}
      initialNumToRender={INITIAL_ROWS}
      maxToRenderPerBatch={BATCH_ROWS}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      onEndReached={() => {
        if (rows.length > 0) onEndReached()
      }}
      stickyHeaderIndices={[0]}
      ListHeaderComponent={
        <View style={styles.row} accessible accessibilityRole="header">
          <AppText style={[styles.label, styles.headerCell]}>{t('matrix.column.note')}</AppText>
          {columns.map((column) => (
            <AppText key={column.key} style={[styles.cell, styles.headerCell]}>
              {t(column.labelKey)}
            </AppText>
          ))}
        </View>
      }
      renderItem={({ item }) => (
        // ONE accessible element per row (role + label) — the values remain
        // visible text; AT reads the row by its label instead of six naked
        // numbers. The row View is styled (height/border), so Fabric keeps it
        // and its testID intact (design record: CI-LANE-FACTS).
        <View
          style={styles.row}
          accessible
          role="row"
          accessibilityLabel={item.label}
          testID={`matrix-row-${item.id}`}
        >
          <AppText style={styles.label} numberOfLines={1}>
            {item.label}
          </AppText>
          {item.values.map((value, index) => (
            <AppText key={columns[index]?.key ?? String(index)} style={styles.cell}>
              {formatCellValue(value)}
            </AppText>
          ))}
        </View>
      )}
    />
  )
}
