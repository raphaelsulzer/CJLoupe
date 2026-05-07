import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ThemeContext, type Theme, type ThemeMode } from '@/components/theme-context'

const STORAGE_KEY = 'cjloupe-theme'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'
const THEME_CHANGING_CLASS = 'theme-changing'

let themeTransitionCleanupFrame: number | null = null

function getStoredThemeMode(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : null
}

function getSystemTheme(): Theme {
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

function getInitialThemeMode(): ThemeMode {
  return getStoredThemeMode() ?? 'system'
}

function resolveTheme(themeMode: ThemeMode, systemTheme: Theme) {
  return themeMode === 'system' ? systemTheme : themeMode
}

function suppressTransitionsDuringThemeChange(root: HTMLElement) {
  root.classList.add(THEME_CHANGING_CLASS)

  if (themeTransitionCleanupFrame != null) {
    window.cancelAnimationFrame(themeTransitionCleanupFrame)
  }

  themeTransitionCleanupFrame = window.requestAnimationFrame(() => {
    themeTransitionCleanupFrame = window.requestAnimationFrame(() => {
      root.classList.remove(THEME_CHANGING_CLASS)
      themeTransitionCleanupFrame = null
    })
  })
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  suppressTransitionsDuringThemeChange(root)
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode)
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme)
  const theme = resolveTheme(themeMode, systemTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (themeMode === 'system') {
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    localStorage.setItem(STORAGE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    const mediaQuery = window.matchMedia(MEDIA_QUERY)
    const handleChange = () => setSystemTheme(getSystemTheme())
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeMode(nextTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeMode((current) => {
      if (current === 'light') return 'dark'
      if (current === 'dark') return 'system'
      return 'light'
    })
  }, [])

  const value = useMemo(
    () => ({
      theme,
      themeMode,
      setTheme,
      setThemeMode,
      toggleTheme,
    }),
    [setTheme, theme, themeMode, toggleTheme],
  )

  return (
    <ThemeContext value={value}>
      {children}
    </ThemeContext>
  )
}

export { ThemeProvider }
