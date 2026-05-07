import { createContext } from 'react'

type Theme = 'light' | 'dark'
type ThemeMode = Theme | 'system'

type ThemeContextValue = {
  theme: Theme
  themeMode: ThemeMode
  setTheme: (theme: Theme) => void
  setThemeMode: (themeMode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export { ThemeContext }
export type { Theme, ThemeMode, ThemeContextValue }
