import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { PageMeta } from '@tarojs/components'
import { nativeColors } from '../src/core/appearance'

const state = vi.hoisted(() => ({
  show: new Set<() => void>(), hide: new Set<() => void>(),
  scroll: new Set<(event: { scrollTop: number }) => void>(),
  route: 'home',
  theme: { scheme: 'light', appearance: { mode: 'light', accent: 'iris' } },
  native: vi.fn(), title: vi.fn(), showTabBar: vi.fn(), hideTabBar: vi.fn(),
}))
vi.mock('@tarojs/taro', async () => {
  const { useEffect } = await import('react')
  const hook = (events: Set<() => void>, callback: () => void) => useEffect(() => { events.add(callback); return () => { events.delete(callback) } }, [callback])
  return {
    useRouter: () => ({ path: `/pages/${state.route}/index`, params: {} }),
    useDidShow: (callback: () => void) => hook(state.show, callback),
    useDidHide: (callback: () => void) => hook(state.hide, callback),
    usePageScroll: (callback: (event: { scrollTop: number }) => void) => useEffect(() => { state.scroll.add(callback); return () => { state.scroll.delete(callback) } }, [callback]),
    default: { pxTransform: (n: number) => `${n * 750 / 390}rpx`, showTabBar: state.showTabBar },
    hideTabBar: state.hideTabBar, showTabBar: state.showTabBar,
  }
})
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image', Radio: 'radio', PageMeta: 'page-meta' }))
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
  vi.stubEnv('TARO_ENV', 'weapp'); vi.clearAllMocks(); state.show.clear(); state.hide.clear(); state.scroll.clear()
  state.theme = { scheme: 'light', appearance: { mode: 'light', accent: 'iris' } }
  state.route = 'home'
  state.showTabBar.mockResolvedValue({}); state.hideTabBar.mockResolvedValue({})
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllEnvs() })
function lifecycle(events: Set<() => void>) { act(() => { for (const callback of [...events]) callback() }) }
function scrollTo(scrollTop: number) { act(() => { for (const callback of [...state.scroll]) callback({ scrollTop }) }) }
it.each([['home', '今天，也一起'], ['tasks', '任务'], ['shop', '购物'], ['me', '我的']])('%s shows its compact title after scrolling and hides it again at the top', (route, title) => {
  state.route = route
  act(() => { tree = create(<Page messageEntry title={title}/>) })
  lifecycle(state.show)
  expect(tree!.root.findAllByProps({ className: 'native-top-title' })).toHaveLength(0)
  scrollTo(80)
  expect(tree!.root.findByProps({ className: 'native-top-title' }).findByType('text').children).toEqual([title])
  lifecycle(state.hide); lifecycle(state.show)
  expect(tree!.root.findAllByProps({ className: 'native-top-title' })).toHaveLength(1)
  scrollTo(0)
  expect(tree!.root.findAllByProps({ className: 'native-top-title' })).toHaveLength(0)
})
it.each(['home', 'tasks', 'shop', 'me'])('%s covers the native status and capsule area above scrolling content', route => {
  state.route = route
  act(() => { tree = create(<Page messageEntry title='测试页面'/>) })
  const cover = tree!.root.findByProps({ className: 'native-top-bar' })
  expect(cover.props.style.height).toBe(tree!.root.findByProps({ className: 'page' }).props.style.paddingTop)
  expect(cover.props.style.height).toBe('68px')
  expect(cover.props.ariaHidden).toBe(true)
})
it.each(['home', 'tasks', 'shop', 'me'])('%s paints the native page background in dark mode before onShow and keeps hidden pages in sync', route => {
  state.route = route
  state.theme = { scheme: 'dark', appearance: { mode: 'dark', accent: 'teal' } }
  act(() => { tree = create(<Page messageEntry title='测试页面'/>) })
  expect(tree!.root.findByType(PageMeta).props.pageStyle).toContain(`background-color:${nativeColors.dark.page}`)
  expect(tree!.root.findByType(PageMeta).props.backgroundColor).toBe(nativeColors.dark.page)
  expect(state.native).not.toHaveBeenCalled()
  lifecycle(state.show); lifecycle(state.hide); state.native.mockClear()
  state.theme = { scheme: 'light', appearance: { mode: 'light', accent: 'teal' } }
  act(() => tree!.update(<Page messageEntry title='测试页面'/>))
  expect(tree!.root.findByType(PageMeta).props.pageStyle).toContain(`background-color:${nativeColors.light.page}`)
  expect(state.native).not.toHaveBeenCalled()
})
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
  expect(tree!.root.findAllByType(PageMeta)).toHaveLength(0)
  expect(tree!.root.findAllByProps({ className: 'native-top-bar' })).toHaveLength(0)
})
it('pages using the system navigation bar do not add a custom top cover', () => {
  state.route = 'messages'
  act(() => { tree = create(<Page title='消息中心'/>) })
  expect(tree!.root.findAllByProps({ className: 'native-top-bar' })).toHaveLength(0)
})
it('native portraits and icons use the same responsive units as their surrounding layout', () => {
  act(() => { tree = create(<><Avatar user={{ id: 'alice', nickname: '我' }} partnerId='bob' size={112}/><Icon name='bell' size={24}/></>) })
  expect(tree!.root.findByProps({ className: 'portrait  ' }).props.style.width).toBe(`${112 * 750 / 390}rpx`)
  expect(tree!.root.findByProps({ className: 'ui-icon' }).props.style.width).toBe(`${24 * 750 / 390}rpx`)
})
