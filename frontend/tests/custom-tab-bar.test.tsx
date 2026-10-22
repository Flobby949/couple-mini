import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { badgeColors, nativeColors } from '../src/core/appearance'

const state = vi.hoisted(() => ({ navigate: vi.fn(), nativeBadge: vi.fn(), nativeRemove: vi.fn() }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image' }))
vi.mock('@tarojs/taro', () => ({ default: { setTabBarBadge: state.nativeBadge, removeTabBarBadge: state.nativeRemove } }))
vi.mock('../src/platform', () => ({ switchTab: state.navigate }))
import CustomTabBar from '../src/custom-tab-bar'
import { hideTabBar, setTabBadge, showTabBar, tabBarState, updateTabBar } from '../src/platform/tab-bar'

let tree: ReactTestRenderer | undefined
beforeEach(() => {
  vi.stubEnv('TARO_ENV', 'weapp'); vi.clearAllMocks()
  updateTabBar({ selected: 'home', scheme: 'light', accent: 'iris', hidden: false, counts: { 1: 0, 3: 0 } })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllEnvs() })

it('uses the current theme for outlined badges and all four icon states across six appearances', () => {
  act(() => { tree = create(<CustomTabBar/>); void setTabBadge(1, 3); void setTabBadge(3, 2) })
  for (const scheme of ['light', 'dark'] as const) for (const accent of ['iris', 'teal', 'apricot'] as const) {
    act(() => updateTabBar({ selected: 'tasks', scheme, accent }))
    for (const badge of tree!.root.findAllByProps({ className: 'custom-tab-badge' })) {
      expect(badge.props.style).toEqual({ color: badgeColors[accent][scheme].ink, borderColor: badgeColors[accent][scheme].line, backgroundColor: nativeColors[scheme].surface })
    }
    expect(tree!.root.findAllByType('image').map(node => node.props.src)).toEqual(['home', 'tasks', 'shop', 'me'].map(name => `/assets/tab-icons/${name}-${accent}-${scheme}${name === 'tasks' ? '-active' : ''}.png`))
  }
  expect(state.nativeBadge).not.toHaveBeenCalled()
})

it('switches tabs through the registered routes and leaves the current tab in place', () => {
  act(() => { tree = create(<CustomTabBar/>) })
  act(() => tree!.root.findByProps({ ariaLabel: '首页' }).props.onClick())
  expect(state.navigate).not.toHaveBeenCalled()
  act(() => tree!.root.findByProps({ ariaLabel: '我的' }).props.onClick())
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith('/pages/me/index')
})

it('hides zero counts, caps large counts, and clears the custom badge instead of using the native red badge', () => {
  act(() => { tree = create(<CustomTabBar/>); void setTabBadge(1, 100) })
  expect(tree!.root.findByProps({ className: 'custom-tab-badge' }).children).toEqual(['99+'])
  act(() => { void setTabBadge(1, 0) })
  expect(tree!.root.findAllByProps({ className: 'custom-tab-badge' })).toHaveLength(0)
  expect(state.nativeBadge).not.toHaveBeenCalled(); expect(state.nativeRemove).not.toHaveBeenCalled()
})

it('hides while the cart sheet is open and restores its selection and counts afterward', () => {
  act(() => { updateTabBar({ selected: 'shop' }); void setTabBadge(3, 2); tree = create(<CustomTabBar/>) })
  act(() => { void hideTabBar({ animation: false }) })
  expect(tree!.toJSON()).toBeNull()
  act(() => { void showTabBar({ animation: false }) })
  expect(tabBarState().selected).toBe('shop')
  expect(tree!.root.findByProps({ ariaLabel: '我的，2 个待处理事项' })).toBeDefined()
})
