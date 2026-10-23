import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { Product } from '../src/contracts/commerce'
import type { Pending } from '../src/contracts/api'

const device = vi.hoisted(() => ({
  actor: 'buyer' as string | undefined, files: new Map<string, unknown>(), read: vi.fn(), write: vi.fn(),
  request: vi.fn(), mutate: vi.fn(), navigate: vi.fn(), replace: vi.fn(), recover: vi.fn(), pending: undefined as Pending | undefined,
  show: new Set<() => void>(),
}))
vi.mock('../src/core/api', () => ({ session: () => device.actor ? { user: { id: device.actor } } : undefined, request: device.request, ApiError: Error }))
vi.mock('../src/core/operations', () => ({ mutate: device.mutate, pending: () => device.pending, recover: device.recover }))
vi.mock('../src/core/query', () => ({ refresh: () => Promise.resolve() }))
vi.mock('../src/platform', () => ({ storage: { read: device.read, write: device.write }, navigate: device.navigate, replace: device.replace }))
vi.mock('../src/platform/tab-bar', () => ({ hideTabBar: () => Promise.resolve(), showTabBar: () => Promise.resolve() }))
vi.mock('@tarojs/taro', async () => {
  const { useEffect } = await import('react')
  return { useDidShow: (callback: () => void) => useEffect(() => { device.show.add(callback); return () => { device.show.delete(callback) } }, [callback]) }
})
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Radio: 'radio', Image: 'image' }))
vi.mock('../src/app/theme', () => ({ useTheme: () => ({ scheme: 'light', appearance: { accent: 'iris' } }) }))
vi.mock('../src/features/catalog/components', () => ({ ProductSummary: ({ product }: { product: Product }) => <span>{product.name}</span> }))
vi.mock('../src/ui/visual', () => ({ Icon: () => null, InlineInfo: ({ children }: { children: React.ReactNode }) => children }))

import { useCart } from '../src/features/catalog/cart'
import { CartSheet } from '../src/pages/shop/cart'
import { placeOrder } from '../src/features/orders/api'
import { checkoutPrice } from '../src/features/orders/checkout-intent'
import { Recovery } from '../src/app/recovery'
const product = (id: string, price = 21): Product => ({ id, ownerId: 'seller', name: id, price, stock: 1, coverId: id, description: '', createdAt: '', updatedAt: '' })
let cart: ReturnType<typeof useCart>, tree: ReactTestRenderer | undefined, serial = 0
function Probe() { cart = useCart(); return <span id='count'>{cart.items.length}</span> }
function mount(sheet = false) { act(() => { tree = create(<><Probe/>{sheet && <CartSheet close={() => {}}/>}</>) }) }
beforeEach(() => {
  vi.resetAllMocks(); device.files.clear(); device.actor = `buyer-${++serial}`; device.pending = undefined
  vi.stubGlobal('API_BASE', 'https://example.test/api/v1')
  device.read.mockImplementation(key => structuredClone(device.files.get(key)))
  device.write.mockImplementation((key, value) => device.files.set(key, structuredClone(value)))
  device.request.mockRejectedValue(new Error('offline'))
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; device.show.clear(); vi.unstubAllGlobals() })
const removeButton = () => tree!.root.findAllByType('button').find(node => node.children.includes('移除'))!
const checkout = () => tree!.root.findByProps({ className: 'cart-footer' }).findByType('button')

it('starts empty, adds and removes synchronously while offline, and updates the banner and sheet together', () => {
  device.files.set('legacy-server-cart', { items: [product('old')] })
  mount(true)
  expect(cart.items).toEqual([])
  act(() => { expect(cart.add(product('one'))).toBe(true) })
  expect(tree!.root.findByProps({ id: 'count' }).children).toEqual(['1'])
  expect(tree!.root.findAllByProps({ className: 'cart-row' })).toHaveLength(1)
  act(() => tree!.root.findByProps({ ariaLabel: '选择one' }).props.onClick())
  expect(checkout().props.disabled).toBe(false)
  act(() => removeButton().props.onClick())
  expect(cart.items).toEqual([])
  expect(tree!.root.findAllByProps({ className: 'cart-row' })).toHaveLength(0)
  expect(tree!.root.findByProps({ id: 'count' }).children).toEqual(['0'])
  act(() => { cart.add(product('one')) })
  expect(checkout().props.disabled).toBe(true)
  expect(device.request).not.toHaveBeenCalled(); expect(device.mutate).not.toHaveBeenCalled()
})
it('deduplicates candidates, updates their display snapshot and preserves their order', () => {
  mount()
  act(() => { cart.add(product('one')); cart.add(product('two')); cart.add(product('one', 99)) })
  expect(cart.items.map(item => [item.id, item.price])).toEqual([['two', 21], ['one', 99]])
  expect([...device.files.values()][0]).toEqual(cart.items)
})
it('restores saved candidates after re-login and isolates accounts and API environments', () => {
  const owner = device.actor
  mount(); act(() => { cart.add(product('one')) })
  act(() => tree!.unmount()); device.actor = 'other'; mount()
  expect(cart.items).toEqual([])
  act(() => { cart.add(product('two')) })
  device.actor = owner; act(() => tree!.update(<Probe/>))
  expect(cart.items.map(item => item.id)).toEqual(['one'])
  vi.stubGlobal('API_BASE', 'https://other.test/api/v1'); act(() => tree!.update(<Probe/>))
  expect(cart.items).toEqual([])
  vi.stubGlobal('API_BASE', 'https://example.test/api/v1'); act(() => tree!.update(<Probe/>))
  expect(cart.items.map(item => item.id)).toEqual(['one'])
})
it('keeps the item and selection on storage failure and allows an immediate retry', () => {
  mount(true); act(() => { cart.add(product('one')) })
  act(() => tree!.root.findByProps({ ariaLabel: '选择one' }).props.onClick())
  device.write.mockImplementationOnce(() => { throw new Error('storage full') })
  act(() => removeButton().props.onClick())
  expect(cart.items).toHaveLength(1); expect(cart.error).toBeInstanceOf(Error)
  expect(checkout().props.disabled).toBe(false)
  act(() => removeButton().props.onClick())
  expect(cart.items).toHaveLength(0); expect(cart.error).toBeNull()
})
it('does not overwrite unreadable storage and can reload it after recovery', () => {
  device.read.mockImplementation(() => { throw new Error('unavailable') })
  mount(); act(() => { expect(cart.add(product('one'))).toBe(false) })
  expect(device.write).not.toHaveBeenCalled()
  device.read.mockImplementation(() => [product('saved')])
  act(() => cart.retry())
  expect(cart.items[0].id).toBe('saved'); expect(cart.error).toBeNull()
})
it('does not save a guest cart or add the current user’s own product', () => {
  device.actor = undefined; mount()
  act(() => { expect(cart.add(product('one'))).toBe(false) })
  device.actor = 'seller'; act(() => tree!.update(<Probe/>))
  act(() => { expect(cart.add(product('one'))).toBe(false) })
  expect(device.write).not.toHaveBeenCalled()
})
it('opens checkout with the last viewed price so the confirmation page can validate current data', () => {
  mount(true); act(() => { cart.add({ ...product('one'), stock: 0 }) })
  act(() => tree!.root.findByProps({ ariaLabel: '选择one' }).props.onClick())
  expect(checkout().props.disabled).toBe(false)
  act(() => checkout().props.onClick())
  expect(checkoutPrice('one')).toBe(21)
  expect(device.navigate).toHaveBeenCalledWith('/packages/commerce/checkout/index?id=one')
  expect(device.request).not.toHaveBeenCalled()
})
it('removes only the purchased candidate after server-confirmed success, retaining it on order failure', async () => {
  mount(); act(() => { cart.add(product('one')); cart.add(product('two')) })
  device.mutate.mockRejectedValueOnce(new Error('price changed'))
  await expect(placeOrder('one', 21)).rejects.toThrow('price changed')
  expect(cart.items).toHaveLength(2)
  device.mutate.mockResolvedValueOnce({ orderId: 'order' })
  await act(async () => { await placeOrder('one', 100) })
  expect(device.mutate).toHaveBeenLastCalledWith('/orders', { productId: 'one', confirmedPrice: '100' })
  expect(cart.items.map(item => item.id)).toEqual(['two'])
})
it('does not turn a successful order into a failure if local cleanup cannot be saved', async () => {
  mount(); act(() => { cart.add(product('one')) })
  device.write.mockImplementationOnce(() => { throw new Error('storage full') })
  device.mutate.mockResolvedValueOnce({ orderId: 'order' })
  await act(async () => { expect(await placeOrder('one', 21)).toEqual({ orderId: 'order' }) })
  expect(cart.items).toHaveLength(1)
})
it('cleans up the local candidate when an interrupted order is recovered as successful', async () => {
  mount(); act(() => { cart.add(product('one')) })
  device.pending = { actor: device.actor!, key: 'pending-order', path: '/orders', body: { productId: 'one' }, createdAt: '' }
  device.recover.mockImplementation(async () => { device.pending = undefined; return { status: 'succeeded', response: { orderId: 'a'.repeat(32) } } })
  act(() => tree!.update(<><Probe/><Recovery/></>))
  await act(async () => { for (const callback of [...device.show]) callback() })
  expect(cart.items).toEqual([])
  expect(device.replace).toHaveBeenCalledWith(`/packages/commerce/order-detail/index?id=${'a'.repeat(32)}`)
  expect(device.navigate).not.toHaveBeenCalled()
})
