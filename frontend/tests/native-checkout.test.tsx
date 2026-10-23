import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

const state = vi.hoisted(() => ({ pages: [] as { route: string }[], placeOrder: vi.fn(), onSale: true }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button' }))
vi.mock('@tarojs/taro', () => ({
  useRouter: () => ({ params: { id: 'product' } }),
  default: {
    getCurrentPages: () => state.pages,
    navigateTo: async ({ url }: { url: string }) => { state.pages.push({ route: url }) },
    redirectTo: async ({ url }: { url: string }) => { state.pages.splice(-1, 1, { route: url }) },
    navigateBack: async () => { state.pages.pop() },
  },
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { product: { id: 'product', ownerId: 'seller', price: 10, stock: 2, onSale: state.onSale }, balance: 100 } }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, canShow: true, data: { me: { id: 'buyer' }, partner: { id: 'seller' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/query', () => ({ keys: { product: (id: string) => ['product', id] }, refresh: async () => {} }))
vi.mock('../src/core/operations', () => ({ pending: () => undefined }))
vi.mock('../src/features/notifications/use-reminder-action', async () => {
  const { useAction } = await import('../src/core/use-action')
  return { useReminderAction: useAction }
})
vi.mock('../src/features/orders/api', () => ({ placeOrder: state.placeOrder }))
vi.mock('../src/features/catalog/api', () => ({ getProduct: vi.fn() }))
vi.mock('../src/features/catalog/components', () => ({ ProductSummary: () => null }))
vi.mock('../src/ui/visual', () => ({ Avatar: () => null, Icon: () => null, InlineInfo: () => null }))
vi.mock('../src/ui', () => ({ ErrorState: () => null, Loading: () => null, Notice: () => null }))

import Checkout from '../src/packages/commerce/checkout'
import { back } from '../src/platform'

let tree: ReactTestRenderer | undefined
beforeEach(() => {
  vi.resetAllMocks()
  state.onSale = true
  state.pages = [{ route: '/pages/shop/index' }, { route: '/packages/commerce/checkout/index?id=product' }]
  state.placeOrder.mockResolvedValue({ orderId: 'order' })
  act(() => { tree = create(<Checkout/>) })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined })
async function submit() {
  await act(async () => { tree!.root.findByProps({ className: 'button' }).props.onClick() })
}

it('returns to the shop after ordering without revisiting the submitted checkout', async () => {
  await submit()
  expect(state.placeOrder).toHaveBeenCalledExactlyOnceWith('product', 10)
  expect(state.pages.at(-1)?.route).toBe('/packages/commerce/order-detail/index?id=order')
  await back()
  expect(state.pages).toEqual([{ route: '/pages/shop/index' }])
})

it('blocks a cart candidate when the current product has been taken off sale', async () => {
  state.onSale = false
  act(() => { tree!.update(<Checkout/>) })
  expect(tree!.root.findByProps({ className: 'button' }).props.disabled).toBe(true)
  await submit()
  expect(state.placeOrder).not.toHaveBeenCalled()
})

it('keeps checkout available after a rejected order so the user can retry', async () => {
  state.placeOrder.mockRejectedValueOnce(new Error('下单失败'))
  await submit()
  expect(state.pages.at(-1)?.route).toBe('/packages/commerce/checkout/index?id=product')
  expect(tree!.root.findByProps({ className: 'button' }).props.disabled).toBe(false)
  await submit()
  expect(state.placeOrder).toHaveBeenCalledTimes(2)
  expect(state.pages.at(-1)?.route).toBe('/packages/commerce/order-detail/index?id=order')
})
