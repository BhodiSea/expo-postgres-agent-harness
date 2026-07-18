import { Pressable } from 'react-native'
import { type Palette, useThemedStyles } from '../theme/theme'
import { radius, spacing } from '../theme/tokens.gen'
import { AppText } from './AppText'

// The selectable-row primitive: one pressable option in a picker surface (the
// actions modal's command rows). Like Button, `label` is BOTH the visible text
// and the accessible name (a single source, so they can never disagree), the
// role is always button, and the pressed affordance is the one tokens-only
// opacity dip. The testID rides THIS Pressable — the interactive LEAF — never
// a wrapper View: Fabric view flattening can detach a testID on a bare
// layout-only View (design record: CI-LANE-FACTS, New Architecture caveat).
interface OptionRowProps {
  readonly label: string
  readonly onPress: () => void
  /** What pressing DOES, when the label alone does not say (announced after the name). */
  readonly accessibilityHint?: string
  readonly testID?: string
}

const optionRowStyles = (palette: Palette) => ({
  row: {
    backgroundColor: palette.canvas,
    borderColor: palette.edge,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing * 3,
    paddingVertical: spacing * 2,
  },
  pressed: {
    opacity: 0.7,
  },
})

export function OptionRow({ label, onPress, accessibilityHint, testID }: OptionRowProps) {
  const styles = useThemedStyles(optionRowStyles)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <AppText>{label}</AppText>
    </Pressable>
  )
}
