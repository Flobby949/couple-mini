import Taro, { hideTabBar as nativeHide, showTabBar as nativeShow } from '@tarojs/taro'
import type { Accent, Scheme } from '../core/appearance'

type TabBarState = { selected: string; scheme: Scheme; accent: Accent; hidden: boolean; counts: Record<1 | 3, number> }
let state: TabBarState = { selected: 'home', scheme: 'light', accent: 'iris', hidden: false, counts: { 1: 0, 3: 0 } }
const listeners = new Set<() => void>()
export const tabBarState = () => state
export function observeTabBar(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function updateTabBar(patch: Partial<TabBarState>) {
  if (Object.entries(patch).every(([key, value]) => state[key as keyof TabBarState] === value)) return
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}
export function setTabBadge(index: 1 | 3, count: number) {
  if (process.env.TARO_ENV === 'weapp') {
    if (state.counts[index] !== count) updateTabBar({ counts: { ...state.counts, [index]: count } })
    return Promise.resolve()
  }
  return count > 0 ? Taro.setTabBarBadge({ index, text: count > 99 ? '99+' : String(count) }) : Taro.removeTabBarBadge({ index })
}
export function showTabBar(options: { animation: boolean }) {
  if (process.env.TARO_ENV !== 'weapp') return nativeShow(options)
  updateTabBar({ hidden: false })
  return Promise.resolve()
}
export function hideTabBar(options: { animation: boolean }) {
  if (process.env.TARO_ENV !== 'weapp') return nativeHide(options)
  updateTabBar({ hidden: true })
  return Promise.resolve()
}
