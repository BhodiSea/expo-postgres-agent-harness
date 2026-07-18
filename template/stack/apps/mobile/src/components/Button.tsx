import { Pressable, Text } from 'react-native'
import { type Palette, useThemedStyles } from '../theme/theme'
import { fontWeight, radius, spacing, typeScale } from '../theme/tokens.gen'

// The one button primitive. Consolidating every touchable action here means the
// accent affordance and the a11y contract live in exactly ONE place: `label` is
// BOTH the visible text and the accessible name (a single source, so they can
// never disagree), the role is always button, and the disabled state is
// mirrored into accessibilityState. Variant picks from a closed map, never
// free-form styles.
type ButtonVariant = 'solid' | 'outline' | 'ghost'

interface ButtonProps {
  readonly label: string
  readonly onPress: () => void
  readonly variant?: ButtonVariant
  readonly disabled?: boolean
  readonly testID?: string
}

const buttonStyles = (palette: Palette) => ({
  base: {
    alignSelf: 'flex-start' as const,
    borderRadius: radius.sm,
    paddingHorizontal: spacing * 4,
    paddingVertical: spacing * 2,
  },
  // The accent-tinted border is the SOLE accent highlight across the control set.
  solid: {
    backgroundColor: palette.surface,
    borderColor: palette.accent,
    borderWidth: 1,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: palette.edge,
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  label: {
    color: palette.ink,
    fontSize: typeScale.sm.fontSize,
    lineHeight: typeScale.sm.lineHeight,
    fontWeight: fontWeight.medium,
  },
  labelQuiet: {
    color: palette['ink-muted'],
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
})

export function Button({ label, onPress, variant = 'solid', disabled = false, testID }: ButtonProps) {
  const styles = useThemedStyles(buttonStyles)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, variant !== 'solid' && styles.labelQuiet]}>{label}</Text>
    </Pressable>
  )
}
