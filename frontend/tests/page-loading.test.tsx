import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClientProvider } from '@tanstack/react-query'
import type { Context, Home } from '../src/contracts/api'

const state = vi.hoisted(() => ({
  show: new Set<() => void>(), hide: new Set<() => void>(), route: 'shop',
  context: vi.fn(), catalog: vi.fn(), home: vi.fn(), tasks: vi.fn(), counts: vi.fn(),
  product: vi.fn(), orders: vi.fn(), messages: vi.fn(), unread: vi.fn(),
  mounted: vi.fn(), unmounted: vi.fn(),
}))
vi.mock('@tarojs/taro', async () => {
  const { useEffect } = await import('react')
  const hook = (events: Set<() => void>, callback: () => void) => useEffect(() => { events.add(callback); return () => { events.delete(callback) } }, [callback])
  return { useRouter: () => ({ path: `/pages/${state.route}/index`, params: { id: 'product' } }),
    useDidShow: (callback: () => void) => hook(state.show, callback), useDidHide: (callback: () => void) => hook(state.hide, callback) }
})
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image', ScrollView: 'scroll-view' }))
vi.mock('../src/core/api', () => ({ session: () => ({ user: { id: 'buyer' }, token: 'test-token' }), ApiError: Error }))
vi.mock('../src/platform', () => ({ navigate: vi.fn(), redirect: vi.fn() }))
vi.mock('../src/app/navigation', () => ({ rememberTarget: vi.fn(), routeContext: vi.fn() }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/app/theme', () => ({ useTheme: () => ({ scheme: 'light', appearance: { accent: 'iris' } }) }))
vi.mock('../src/features/identity/api', () => ({ getContext: state.context }))
vi.mock('../src/features/catalog/api', () => ({ getCatalog: state.catalog, getProduct: state.product }))
vi.mock('../src/features/catalog/cart', () => ({ useCart: () => ({ items: [], error: null, add: vi.fn(), retry: vi.fn() }) }))
vi.mock('../src/features/home/api', () => ({ getHome: state.home }))
vi.mock('../src/features/tasks/api', () => ({ getOpenTasks: state.tasks, getTasks: vi.fn() }))
vi.mock('../src/features/orders/api', () => ({ getOrderCounts: state.counts, getOrders: state.orders }))
vi.mock('../src/features/notifications/api', () => ({ getMessages: state.messages, getUnread: state.unread, readAllMessages: vi.fn() }))
vi.mock('../src/core/operations', () => ({ pending: () => undefined }))
vi.mock('../src/features/checkin/api', () => ({ checkIn: vi.fn() }))
vi.mock('../src/core/use-action', () => ({ useAction: () => ({ busy: false }) }))
vi.mock('../src/features/notifications/use-reminder-action', () => ({ useReminderAction: () => ({ busy: false }) }))
vi.mock('../src/pages/shop/cart', () => ({ CartSheet: () => null }))
vi.mock('../src/core/media', () => ({ clearMedia: vi.fn() }))
vi.mock('../src/ui/use-artwork', () => ({ useArtwork: () => ({}) }))
vi.mock('../src/features/catalog/components', async () => {
  const { useEffect } = await import('react')
  const Cover = () => { useEffect(() => { state.mounted(); return () => state.unmounted() }, []); return null }
  return { Cover, ProductSummary: Cover }
})
vi.mock('../src/ui/visual', async () => {
  const { useEffect } = await import('react')
  return { Avatar: () => { useEffect(() => { state.mounted(); return () => state.unmounted() }, []); return null },
    Icon: () => null, BalanceTiles: () => null, PoolCard: () => null, MenuRow: () => null, PersonRow: () => null, InlineInfo: () => null, ConnectedPair: () => null,
    Section: ({ children }: { children: React.ReactNode }) => children }
})

import Shop from '../src/pages/shop'
import HomePage from '../src/pages/home'
import Tasks from '../src/pages/tasks'
import Me from '../src/pages/me'
import Store from '../src/packages/commerce/store'
import ProductPage from '../src/packages/commerce/product'
import OrdersPage from '../src/packages/commerce/orders'
import MessagesPage from '../src/packages/account/messages'
import PartnerPage from '../src/packages/account/partner'
import { keys, queries } from '../src/core/query'
const context: Context = { me: { id: 'buyer', nickname: '我' }, partner: { id: 'seller', nickname: '伴侣' }, couple: { id: 'couple', dailyLimit: 100, doubleDays: 1 }, stage: 'ready', serverTime: '', businessDate: '' }
const catalog = { balance: 10, products: [{ id: 'product', name: '测试商品', price: 1, stock: 10, coverId: 'cover' }] }
const home: Home = { context, points: { balance: 10, earned: 0, dailyLimit: 100, remaining: 100, available: 100, reserved: 0, total: 100 }, checkin: { me: true, partner: true }, todos: [], orderTodos: [], taskTodos: [], milestones: [] }
const orderCounts = { buyer: { pending: 0, fulfilling: 0, awaiting_receipt: 0 }, seller: { pending: 0, fulfilling: 0, awaiting_receipt: 0 } }
const orders = { items: [{ id: 'order', snapshot: catalog.products[0], status: 'pending', createdAt: '2026-10-22T12:00:00Z', allowedActions: [] }], nextCursor: '' }
const messages = { items: [{ id: 'message', title: '测试消息', body: '测试内容', target: { type: 'order' }, occurredAt: '2026-10-22T12:00:00Z' }], nextCursor: '' }
let tree: ReactTestRenderer | undefined
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('TARO_ENV', 'weapp'); vi.clearAllMocks(); queries.clear()
  state.context.mockResolvedValue(context); state.catalog.mockResolvedValue(catalog); state.home.mockResolvedValue(home)
  state.tasks.mockResolvedValue([]); state.counts.mockResolvedValue(orderCounts)
  state.product.mockResolvedValue({ product: { ...catalog.products[0], ownerId: 'seller' }, balance: 10 })
  state.orders.mockResolvedValue(orders); state.messages.mockResolvedValue(messages); state.unread.mockResolvedValue({ count: 1 })
  queries.setQueryData(keys.context, context); queries.setQueryData(keys.home, home)
  queries.setQueryData(keys.catalog('partner'), catalog)
  queries.setQueryData(keys.openTasks, []); queries.setQueryData(keys.orderCounts, orderCounts)
  queries.setQueryData(keys.catalog('mine'), catalog)
  queries.setQueryData(keys.product('product'), { product: { ...catalog.products[0], ownerId: 'seller' }, balance: 10 })
  queries.setQueryData(keys.orders('buyer', ''), { pages: [orders], pageParams: [''] })
  queries.setQueryData(keys.messages('all'), { pages: [messages], pageParams: [''] }); queries.setQueryData(keys.unread, { count: 1 })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; queries.clear(); state.show.clear(); state.hide.clear(); vi.useRealTimers(); vi.unstubAllEnvs() })
function mount(Component: React.ComponentType) { act(() => { tree = create(<QueryClientProvider client={queries}><Component/></QueryClientProvider>) }) }
async function lifecycle(events: Set<() => void>) { await act(async () => { for (const callback of [...events]) callback(); await vi.advanceTimersByTimeAsync(1) }) }
const loading = () => tree!.root.findAllByProps({ className: 'loading' }).length
const content = () => JSON.stringify(tree!.toJSON(), (key, value) => key === 'disabled' ? undefined : value)

it('loads product details when the sheet mounts after the shop has already been shown', async () => {
  queries.removeQueries({ queryKey: keys.product('product') })
  state.route = 'shop'; mount(Shop); await lifecycle(state.show)
  expect(state.product).not.toHaveBeenCalled()
  await act(async () => {
    tree!.root.findByProps({ ariaLabel: '查看测试商品详情' }).props.onClick({ stopPropagation: vi.fn() })
    await vi.advanceTimersByTimeAsync(10)
  })
  expect(tree!.root.findAllByProps({ ariaLabel: '商品详情', role: 'dialog' })).toHaveLength(1)
  expect(state.product).toHaveBeenCalledExactlyOnceWith('product')
  expect(loading()).toBe(0)
  expect(content()).toContain('兑现说明')
})

it.each([['home', HomePage], ['tasks', Tasks], ['shop', Shop], ['me', Me], ['store', Store], ['product', ProductPage], ['orders', OrdersPage], ['messages', MessagesPage], ['partner', PartnerPage]] as const)('%s retains loaded content when hidden and does not poll until shown again', async (route, Component) => {
  state.route = route; mount(Component); await lifecycle(state.show)
  expect(loading()).toBe(0)
  const mounts = state.mounted.mock.calls.length
  const before = content()
  await lifecycle(state.hide)
  expect(loading()).toBe(0)
  expect(content()).toBe(before)
  expect(state.unmounted).not.toHaveBeenCalled()
  const requests = [state.context, state.catalog, state.home, state.tasks, state.counts, state.product, state.orders, state.messages, state.unread]
  const counts = requests.map(request => request.mock.calls.length)
  await act(async () => { await queries.invalidateQueries(); await vi.advanceTimersByTimeAsync(60000) })
  expect(requests.map(request => request.mock.calls.length)).toEqual(counts)
  await lifecycle(state.show)
  expect(loading()).toBe(0)
  expect(state.mounted).toHaveBeenCalledTimes(mounts)
  expect(state.context.mock.calls.length).toBeGreaterThan(counts[0])
})

it('keeps cached products visible during a slow refresh and removes them if the gate becomes locked', async () => {
  state.route = 'shop'; mount(Shop); await lifecycle(state.show); await lifecycle(state.hide)
  await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
  state.catalog.mockImplementation(() => new Promise(() => {}))
  await lifecycle(state.show)
  expect(loading()).toBe(0)
  expect(tree!.root.findAllByProps({ className: 'product-tile' })).toHaveLength(1)
  act(() => { queries.setQueryData(keys.context, { ...context, stage: 'rules' }) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(tree!.root.findAllByProps({ className: 'product-tile' })).toHaveLength(0)
})

it('warms the catalog after home content loads so the first shop render needs no network wait', async () => {
  queries.removeQueries({ queryKey: keys.catalog('partner') }); queries.removeQueries({ queryKey: keys.home })
  let finishHome!: (value: Home) => void
  state.home.mockImplementation(() => new Promise<Home>(resolve => { finishHome = resolve }))
  state.route = 'home'; mount(HomePage); await lifecycle(state.show)
  expect(state.catalog).not.toHaveBeenCalled()
  await act(async () => { finishHome(home); await vi.advanceTimersByTimeAsync(5) })
  expect(state.catalog).toHaveBeenCalledOnce()
  expect(queries.getQueryData(keys.catalog('partner'))).toEqual(catalog)
  state.catalog.mockImplementation(() => new Promise(() => {}))
  act(() => tree!.unmount()); state.route = 'shop'; mount(Shop)
  expect(loading()).toBe(0)
  await lifecycle(state.show)
  expect(state.catalog).toHaveBeenCalledTimes(2)
  expect(loading()).toBe(0)
})
