import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { Pending } from '../src/contracts/api'

const state = vi.hoisted(() => ({ pages: [] as { route: string }[], record: undefined as Pending | undefined, recover: vi.fn(), removeCart: vi.fn() }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button' }))
vi.mock('@tarojs/taro', () => ({ useDidShow: vi.fn(), default: {
  getCurrentPages: () => state.pages,
  navigateTo: async ({ url }: { url: string }) => { state.pages.push({ route: url }) },
  redirectTo: async ({ url }: { url: string }) => { state.pages.splice(-1, 1, { route: url }) },
  navigateBack: async () => { state.pages.pop() },
} }))
vi.mock('../src/core/operations', () => ({ pending: () => state.record, recover: state.recover }))
vi.mock('../src/core/api', () => ({ session: () => ({ user: { id: 'buyer' } }) }))
vi.mock('../src/core/query', () => ({ refresh: async () => {} }))
vi.mock('../src/features/catalog/cart', () => ({ removeCart: state.removeCart }))
vi.mock('../src/ui', () => ({ ErrorState: () => null }))

import { Recovery } from '../src/app/recovery'
import { back } from '../src/platform'

const id = 'a'.repeat(32)
let tree: ReactTestRenderer | undefined
beforeEach(() => { vi.resetAllMocks(); state.record = undefined; state.pages = [] })
afterEach(() => { act(() => tree?.unmount()); tree = undefined })
function mount(path: string, form: string) {
  state.record = { key: 'operation', path, body: { productId: 'product' }, actor: 'buyer', createdAt: '2026-10-23T00:00:00Z' }
  state.pages = [{ route: '/pages/home/index' }, { route: form }]
  act(() => { tree = create(<Recovery/>) })
}
async function check() {
  await act(async () => { tree!.root.findByProps({ className: 'button' }).props.onClick() })
}

it.each([
  ['/orders', '/packages/commerce/checkout/index', '/packages/commerce/order-detail/index', { orderId: id }],
  ['/tasks', '/packages/tasks/edit/index', '/packages/tasks/detail/index', { taskId: id }],
  [`/tasks/${id}`, `/packages/tasks/edit/index?id=${id}`, '/packages/tasks/detail/index', { taskId: id }],
  ['/gifts', '/packages/account/gift/index', '/packages/account/gift-detail/index', { id }],
])('removes the submitted form after recovering successful %s', async (path, form, destination, response) => {
  state.recover.mockImplementation(async () => { state.record = undefined; return { status: 'succeeded', response } })
  mount(path, form)
  await check()
  expect(state.recover).toHaveBeenCalledExactlyOnceWith(false)
  expect(state.pages.at(-1)?.route).toBe(`${destination}?id=${id}`)
  if (path === '/orders') expect(state.removeCart).toHaveBeenCalledExactlyOnceWith('product')
  await back()
  expect(state.pages).toEqual([{ route: '/pages/home/index' }])
})

it.each(['absent', 'closed', 'rejected'])('keeps the form when recovery reports %s', async status => {
  state.recover.mockImplementation(async () => { if (status !== 'absent') state.record = undefined; return { status } })
  mount('/orders', '/packages/commerce/checkout/index')
  await check()
  expect(state.pages).toEqual([{ route: '/pages/home/index' }, { route: '/packages/commerce/checkout/index' }])
  expect(state.removeCart).not.toHaveBeenCalled()
})
