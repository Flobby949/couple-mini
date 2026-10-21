import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ pages: [] as { route: string }[], back: vi.fn().mockResolvedValue({}), replace: vi.fn().mockResolvedValue({}) }))
vi.mock('@tarojs/taro', () => ({ default: { getCurrentPages: () => state.pages, navigateBack: state.back, redirectTo: state.replace } }))
import { returnTo } from '../src/platform'
afterEach(() => { vi.clearAllMocks(); state.pages = [] })
it.each(['gift', 'messages', 'notification-settings'])('returns to an existing %s list without pushing a duplicate route', async name => {
  state.pages = [{ route: 'pages/me/index' }, { route: `packages/account/${name}/index` }, { route: 'packages/account/detail/index' }]
  await returnTo(`/packages/account/${name}/index`)
  expect(state.back).toHaveBeenCalledExactlyOnceWith({ delta: 1 })
  expect(state.replace).not.toHaveBeenCalled()
})
it('pops all intervening pages when the target list is already deeper in the stack', async () => {
  state.pages = [{ route: '/packages/account/gift/index' }, { route: 'messages' }, { route: 'message-detail' }, { route: 'gift-detail' }]
  await returnTo('/packages/account/gift/index')
  expect(state.back).toHaveBeenCalledExactlyOnceWith({ delta: 3 })
})
it('replaces a directly opened detail when its list is absent', async () => {
  state.pages = [{ route: 'packages/account/gift-detail/index' }]
  await returnTo('/packages/account/gift/index')
  expect(state.replace).toHaveBeenCalledExactlyOnceWith({ url: '/packages/account/gift/index' })
  expect(state.back).not.toHaveBeenCalled()
})
it('does nothing when already on the destination', async () => {
  state.pages = [{ route: 'packages/account/gift/index' }]
  await returnTo('/packages/account/gift/index')
  expect(state.replace).not.toHaveBeenCalled(); expect(state.back).not.toHaveBeenCalled()
})
