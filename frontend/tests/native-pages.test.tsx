import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

const state = vi.hoisted(() => ({
  show: new Set<() => void>(), hide: new Set<() => void>(),
  theme: { scheme: 'light', appearance: { mode: 'light', accent: 'iris' } },
  native: vi.fn(), title: vi.fn(), showTabBar: vi.fn(), hideTabBar: vi.fn(),
}))
vi.mock('@tarojs/taro', async () => {
  const { useEffect } = await import('react')
  const hook = (events: Set<() => void>, callback: () => void) => useEffect(() => { events.add(callback); return () => { events.delete(callback) } }, [callback])
  return {
    useRouter: () => ({ path: '/pages/home/index', params: {} }),
    useDidShow: (callback: () => void) => hook(state.show, callback),
    useDidHide: (callback: () => void) => hook(state.hide, callback),
    default: { pxTransform: (n: number) => `${n * 750 / 390}rpx`, showTabBar: state.showTabBar },
    hideTabBar: state.hideTabBar, showTabBar: state.showTabBar,
  }
})
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image', Radio: 'radio' }))
vi.mock('../src/app/theme', () => ({ useTheme: () => state.theme }))
vi.mock('../src/platform/theme', () => ({ applyNativeTheme: state.native }))
vi.mock('../src/platform', () => ({ setPageTitle: state.title, topInset: () => 24, back: vi.fn(), storage: { read: vi.fn() } }))
vi.mock('../src/features/notifications/entry', () => ({ MessageEntry: () => null }))
vi.mock('../src/features/tasks/tab-badge', () => ({ TaskTabBadge: () => null }))
vi.mock('../src/features/orders/tab-badge', () => ({ OrderTabBadge: () => null }))
vi.mock('../src/app/recovery', () => ({ Recovery: () => null }))
vi.mock('../src/core/api', () => ({ session: () => undefined }))
vi.mock('../src/features/identity/api', () => ({ getContext: vi.fn() }))

import { Page } from '../src/app/page'
import { Avatar, Icon } from '../src/ui/visual'
import { tabBarState, updateTabBar } from '../src/platform/tab-bar'
let tree: ReactTestRenderer | undefined
beforeEach(() => {
  vi.stubEnv('TARO_ENV', 'weapp'); vi.clearAllMocks(); state.show.clear(); state.hide.clear()
  state.theme = { scheme: 'light', appearance: { mode: 'light', accent: 'iris' } }
  state.showTabBar.mockResolvedValue({}); state.hideTabBar.mockResolvedValue({})
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllEnvs() })
function lifecycle(events: Set<() => void>) { act(() => { for (const callback of [...events]) callback() }) }
it('hidden pages cannot overwrite the current native title or theme', () => {
  act(() => { tree = create(<Page messageEntry title='今天，也一起'/>) })
  lifecycle(state.show)
  state.native.mockClear(); state.title.mockClear()
  lifecycle(state.hide)
  state.theme = { scheme: 'dark', appearance: { mode: 'dark', accent: 'teal' } }
  act(() => tree!.update(<Page messageEntry title='隐藏页标题'/>))
  expect(state.native).not.toHaveBeenCalled(); expect(state.title).not.toHaveBeenCalled()
  lifecycle(state.show)
  expect(state.native).toHaveBeenLastCalledWith('dark', 'teal')
  expect(state.title).toHaveBeenLastCalledWith('隐藏页标题')
})
it('returning to a tab page restores the custom tab bar', () => {
  act(() => { tree = create(<Page messageEntry title='首页'/>) })
  lifecycle(state.show); lifecycle(state.hide); updateTabBar({ hidden: true }); lifecycle(state.show)
  expect(tabBarState().hidden).toBe(false)
  expect(tabBarState().selected).toBe('home')
})
it('H5 still restores the platform tab bar when returning to a tab page', () => {
  vi.stubEnv('TARO_ENV', 'h5')
  act(() => { tree = create(<Page messageEntry title='首页'/>) })
  lifecycle(state.show)
  expect(state.showTabBar).toHaveBeenCalledWith({ animation: false })
})
it('native portraits and icons use the same responsive units as their surrounding layout', () => {
  act(() => { tree = create(<><Avatar user={{ id: 'alice', nickname: '我' }} partnerId='bob' size={112}/><Icon name='bell' size={24}/></>) })
  expect(tree!.root.findByProps({ className: 'portrait  ' }).props.style.width).toBe(`${112 * 750 / 390}rpx`)
  expect(tree!.root.findByProps({ className: 'ui-icon' }).props.style.width).toBe(`${24 * 750 / 390}rpx`)
})
