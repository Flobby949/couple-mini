import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const state = vi.hoisted(() => ({
  gate: { visible: true, allowed: true, canShow: true, data: { me: { id: 'buyer', nickname: '我' }, partner: { id: 'seller', nickname: '伴侣' } } },
  counts: vi.fn(), orders: vi.fn(), home: vi.fn(), navigate: vi.fn(), setBadge: vi.fn().mockResolvedValue({}), removeBadge: vi.fn().mockResolvedValue({}),
}))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', ScrollView: 'scroll-view' }))
vi.mock('@tarojs/taro', () => ({ default: { setTabBarBadge: state.setBadge, removeTabBarBadge: state.removeBadge }, useRouter: () => ({ params: {} }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => state.gate }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/features/orders/api', () => ({ getOrderCounts: state.counts, getOrders: state.orders }))
vi.mock('../src/features/home/api', () => ({ getHome: state.home }))
vi.mock('../src/platform', () => ({ navigate: state.navigate }))
vi.mock('../src/ui', () => ({ Empty: () => null, ErrorState: () => null, Loading: () => null }))
vi.mock('../src/ui/visual', () => ({ Avatar: () => null, BalanceTiles: () => null, Icon: () => null, MenuRow: () => null }))
vi.mock('../src/features/catalog/components', () => ({ ProductSummary: () => null }))

import Me from '../src/pages/me'
import OrdersPage from '../src/packages/commerce/orders'
import { OrderTabBadge } from '../src/features/orders/tab-badge'

let tree: ReactTestRenderer | undefined
let client: QueryClient
const countsKey = ['order-counts']
const homeKey = ['home']
const orderTodos = (count: number) => ({ orderTodos: Array.from({ length: count }, (_, id) => ({ id: String(id) })) })
const counts = () => ({ buyer: { pending: 2, fulfilling: 3, awaiting_receipt: 1 }, seller: { pending: 4, fulfilling: 1, awaiting_receipt: 0 } })
const button = (label: string) => tree!.root.findByProps({ ariaLabel: label })
async function render(children: React.ReactNode) {
  await act(async () => { tree = create(<QueryClientProvider client={client}>{children}</QueryClientProvider>); await new Promise(resolve => setTimeout(resolve, 10)) })
}
beforeEach(() => {
  vi.clearAllMocks(); state.gate.visible = true; state.gate.allowed = true
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  state.counts.mockResolvedValue(counts()); state.orders.mockResolvedValue({ items: [], nextCursor: '' }); state.home.mockResolvedValue({ points: { balance: 0, earned: 0, dailyLimit: 100, remaining: 100 }, orderTodos: [{ id: 'seller-pending', allowedActions: ['accept'] }, { id: 'buyer-confirm', allowedActions: ['confirm'] }] })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; client.clear() })

it('shows role totals and matching status counts in My Orders shortcuts while keeping All unnumbered', async () => {
  client.setQueryData(countsKey, counts())
  await render(<Me/>)
  expect(button('我下的单，6 个未结束订单')).toBeDefined()
  expect(button('我收到的，5 个未结束订单')).toBeDefined()
  expect(button('待接单，2 个订单')).toBeDefined()
  expect(button('待兑现，3 个订单')).toBeDefined()
  expect(button('待确认，1 个订单')).toBeDefined()
  expect(button('全部').findAllByProps({ className: 'order-count-badge' })).toHaveLength(0)
  act(() => button('我收到的，5 个未结束订单').props.onClick())
  expect(button('待接单，4 个订单')).toBeDefined()
  expect(button('待确认，0 个订单').findAllByProps({ className: 'order-count-badge' })).toHaveLength(0)
  act(() => button('待接单，4 个订单').props.onClick())
  expect(state.navigate).toHaveBeenCalledWith('/packages/commerce/orders/index?role=seller&status=pending')
})

it('shows the same counts on the order list and updates them when switching roles', async () => {
  client.setQueryData(countsKey, counts())
  await render(<OrdersPage/>)
  expect(button('待接单，2 个订单')).toBeDefined()
  expect(button('待兑现，3 个订单')).toBeDefined()
  act(() => button('我收到的，5 个未结束订单').props.onClick())
  expect(button('待接单，4 个订单')).toBeDefined()
  expect(button('待兑现，1 个订单')).toBeDefined()
  expect(button('全部').findAllByProps({ className: 'order-count-badge' })).toHaveLength(0)
})

it('caps page counts at 99+ and hides empty role and status badges', async () => {
  client.setQueryData(countsKey, { buyer: { pending: 101, fulfilling: 0, awaiting_receipt: 0 }, seller: { pending: 0, fulfilling: 0, awaiting_receipt: 0 } })
  await render(<Me/>)
  expect(button('我下的单，101 个未结束订单').findByProps({ className: 'order-count-badge' }).children).toEqual(['99+'])
  expect(button('待接单，101 个订单').findByProps({ className: 'order-count-badge' }).children).toEqual(['99+'])
  expect(button('我收到的，0 个未结束订单').findAllByProps({ className: 'order-count-badge' })).toHaveLength(0)
})

it('reminds only about orders needing my action, regardless of unfinished totals, and clears at zero', async () => {
  client.setQueryData(countsKey, counts())
  await render(<OrderTabBadge/>)
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 3, text: '2' })
  state.home.mockResolvedValue(orderTodos(1))
  await act(async () => { await client.invalidateQueries({ queryKey: homeKey }); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 3, text: '1' })
  state.home.mockResolvedValue(orderTodos(0))
  await act(async () => { await client.invalidateQueries({ queryKey: homeKey }); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(state.removeBadge).toHaveBeenLastCalledWith({ index: 3 })
})

it('caps the native badge and prevents hidden pages from overwriting the active tab', async () => {
  client.setQueryData(homeKey, orderTodos(101))
  await render(<OrderTabBadge/>)
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 3, text: '99+' })
  state.gate.visible = false; state.gate.allowed = false
  state.setBadge.mockClear(); state.removeBadge.mockClear()
  act(() => tree!.update(<QueryClientProvider client={client}><OrderTabBadge/></QueryClientProvider>))
  expect(state.setBadge).not.toHaveBeenCalled(); expect(state.removeBadge).not.toHaveBeenCalled()
})

it('does not request order counts before access is allowed', async () => {
  state.gate.allowed = false
  await render(<OrderTabBadge/>)
  expect(state.home).not.toHaveBeenCalled()
  expect(state.removeBadge).toHaveBeenCalledWith({ index: 3 })
})

it('counts a cancellation awaiting my decision once and ignores all orders waiting on the partner', async () => {
  client.setQueryData(countsKey, counts())
  client.setQueryData(homeKey, { orderTodos: [{ id: 'cancellation', status: 'awaiting_receipt', cancelPending: true, allowedActions: ['approve_cancel', 'deny_cancel', 'cancel'] }] })
  await render(<OrderTabBadge/>)
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 3, text: '1' })
})
