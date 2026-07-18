import type { ReactNode } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { type Palette, useThemedStyles } from '../theme/theme'
import { spacing } from '../theme/tokens.gen'

// The one screen container: safe-area handling + the canvas token + the base
// gutter, in one place. Every route's top-level surface renders through it so
// "a screen" always means the same thing to the theme, to the perf lane
// (paint area), and to Maestro selectors (the testID is the route surface).
interface ScreenProps {
  readonly children: ReactNode
  readonly testID?: string
}

const screenStyles = (palette: Palette) => ({
  root: {
    backgroundColor: palette.canvas,
    flex: 1,
    gap: spacing * 3,
    padding: spacing * 4,
  },
})

export function Screen({ children, testID }: ScreenProps) {
  const styles = useThemedStyles(screenStyles)
  return (
    <SafeAreaView testID={testID} style={styles.root}>
      {children}
    </SafeAreaView>
  )
}
