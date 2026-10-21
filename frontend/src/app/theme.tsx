import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { useDidShow } from '@tarojs/taro'
import { storage } from '../platform'
import { observeScheme, systemScheme } from '../platform/theme'
import { defaultAppearance, parseAppearance, resolveScheme, type Appearance, type Scheme } from '../core/appearance'

const Theme = createContext({ appearance: defaultAppearance, scheme: 'light' as Scheme, setAppearance: (_: Appearance) => {} })
export function ThemeProvider({ children }: PropsWithChildren) {
  const [appearance, set] = useState(() => { try { return parseAppearance(storage.read('appearance')) } catch { return defaultAppearance } })
  const [system, setSystem] = useState(systemScheme)
  useEffect(() => observeScheme(setSystem), [])
  useDidShow(() => setSystem(systemScheme()))
  const setAppearance = (next: Appearance) => { storage.write('appearance', next); set(next) }
  return <Theme.Provider value={{ appearance, scheme: resolveScheme(appearance.mode, system), setAppearance }}>{children}</Theme.Provider>
}
export function useTheme() { return useContext(Theme) }
