import Taro from '@tarojs/taro'
import { accentColors, nativeColors, type Accent, type Scheme } from '../core/appearance'
import { updateTabBar } from './tab-bar'

export function systemScheme(): Scheme {
  if (process.env.TARO_ENV === 'h5') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  try { return Taro.getAppBaseInfo().theme === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}
export function observeScheme(listener: (value: Scheme) => void) {
  if (process.env.TARO_ENV === 'h5') {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => listener(e.matches ? 'dark' : 'light')
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }
  const handler: Taro.onThemeChange.Callback = event => listener(event.theme)
  Taro.onThemeChange(handler)
  return () => Taro.offThemeChange(handler)
}
export function applyNativeTheme(scheme: Scheme, accent: Accent) {
  updateTabBar({ scheme, accent })
  const base = nativeColors[scheme], colors = accentColors[accent][scheme]
  // Initial non-Tab routes have no TabBar yet; each page re-applies on show.
  void Taro.setNavigationBarColor({ frontColor: base.front, backgroundColor: base.page }).catch(() => {})
  void Taro.setBackgroundColor({ backgroundColor: base.page, backgroundColorTop: base.page, backgroundColorBottom: base.page }).catch(() => {})
  void Taro.setTabBarStyle({ color: base.muted, selectedColor: colors.primary, backgroundColor: base.surface, borderStyle: base.border }).catch(() => {})
  for (const [index, name] of ['home', 'tasks', 'shop', 'me'].entries()) {
    void Taro.setTabBarItem({ index, iconPath: `/assets/tab-icons/${name}-${accent}-${scheme}.png`, selectedIconPath: `/assets/tab-icons/${name}-${accent}-${scheme}-active.png` }).catch(() => {})
  }
  if (process.env.TARO_ENV === 'h5') {
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'accent-iris', 'accent-teal', 'accent-apricot')
    document.documentElement.classList.add(`theme-${scheme}`, `accent-${accent}`)
    document.documentElement.style.colorScheme = scheme
    document.documentElement.style.backgroundColor = base.page
    document.body.style.backgroundColor = base.page
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base.page)
  }
}
