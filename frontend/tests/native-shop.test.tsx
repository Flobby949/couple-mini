import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const fixture = vi.hoisted(() => ({ navigate: vi.fn(), add: vi.fn(), refresh: vi.fn(), catalogReady: true, error: null as Error | null, measure: vi.fn(), hide: new Set<() => void>(), product: { id: 'product', name: '零积分心意', price: 0, stock: 1, coverId: 'cover' } }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button' }))
vi.mock('@tarojs/taro', async () => {
  const { useEffect } = await import('react')
  return { useDidHide: (callback: () => void) => useEffect(() => { fixture.hide.add(callback); return () => { fixture.hide.delete(callback) } }, [callback]),
    default: { createSelectorQuery: () => {
      const query = { select: () => ({ boundingClientRect: () => query }), exec: fixture.measure }
      return query
    } } }
})
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: fixture.catalogReady ? { products: [fixture.product], balance: 0 } : undefined }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, canShow: true, data: { me: { id: 'buyer' }, partner: { id: 'seller', nickname: '伴侣' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/query', () => ({ keys: { catalog: () => ['catalog'] }, refresh: fixture.refresh }))
vi.mock('../src/platform', () => ({ navigate: fixture.navigate }))
vi.mock('../src/features/catalog/api', () => ({ getCatalog: vi.fn() }))
vi.mock('../src/features/catalog/cart', () => ({ useCart: () => ({ items: [], error: fixture.error, add: fixture.add, retry: vi.fn() }) }))
vi.mock('../src/features/catalog/components', () => ({ Cover: () => null }))
vi.mock('../src/ui/visual', () => ({ Avatar: () => null, Icon: () => null }))
vi.mock('../src/ui/use-artwork', () => ({ useArtwork: () => ({ emptyStore: '/empty.png' }) }))
vi.mock('../src/pages/shop/cart', () => ({ CartSheet: () => null }))
import Shop from '../src/pages/shop'
let tree: ReactTestRenderer | undefined
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks()
  fixture.add.mockReturnValue(true); fixture.refresh.mockResolvedValue(undefined); fixture.error = null; fixture.catalogReady = true
  fixture.measure.mockImplementation(callback => callback([{ left: 160, top: 320, width: 38, height: 38 }, { left: 12, top: 660, width: 27, height: 27 }]))
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; fixture.hide.clear(); vi.useRealTimers() })
function mount() { act(() => { tree = create(<Shop/>) }) }
const addButton = () => tree!.root.findByProps({ ariaLabel: '将零积分心意加入购物车' })
const flights = () => tree!.root.findAllByProps({ className: 'cart-flight' })
const target = () => tree!.root.findByProps({ id: 'shop-cart-target' })
const tap = () => addButton().props.onClick({ stopPropagation: vi.fn(), changedTouches: [{ clientX: 185, clientY: 338 }] })
it('exposes product details as a native button while retaining the visible product name', () => {
  act(() => { tree = create(<Shop/>) })
  const link = tree!.root.findByProps({ ariaLabel: '查看零积分心意详情' })
  expect(link.type).toBe('button')
  expect(link.children).toContain('零积分心意')
  const stop = vi.fn()
  act(() => link.props.onClick({ stopPropagation: stop }))
  expect(stop).toHaveBeenCalledOnce()
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/packages/commerce/product/index?id=product')
})
it('the cart action does not trigger product navigation', async () => {
  act(() => { tree = create(<Shop/>) })
  const stop = vi.fn()
  await act(async () => { tree!.root.findByProps({ ariaLabel: '将零积分心意加入购物车' }).props.onClick({ stopPropagation: stop }) })
  expect(stop).toHaveBeenCalledOnce()
  expect(fixture.add).toHaveBeenCalledExactlyOnceWith(fixture.product)
  expect(fixture.navigate).not.toHaveBeenCalled()
})
it('flies immediately after local storage succeeds without refreshing server queries', async () => {
  mount(); await act(async () => { tap() })
  expect(fixture.refresh).not.toHaveBeenCalled()
  expect(flights()[0].props.style).toMatchObject({ left: '185px', top: '338px', '--cart-flight-x': '-159.5px', '--cart-flight-y': '335.5px' })
  act(() => { vi.advanceTimersByTime(560) })
  expect(flights()).toHaveLength(0)
  expect(target().props.className).toContain('is-receiving')
  act(() => { vi.advanceTimersByTime(180) })
  expect(target().props.className).not.toContain('is-receiving')
})
it('does not show an arrival when adding to the cart fails', async () => {
  fixture.add.mockReturnValueOnce(false); fixture.error = new Error('加入失败')
  mount(); await act(async () => { tap() })
  expect(flights()).toHaveLength(0)
  expect(target().props.className).not.toContain('is-receiving')
  expect(JSON.stringify(tree!.toJSON())).toContain('加入失败')
})
it('uses the button center when keyboard or mouse events have no touch coordinates, including after scrolling', async () => {
  fixture.measure.mockImplementation(callback => callback([{ left: 160, top: 40, width: 38, height: 38 }, { left: 12, top: 460, width: 27, height: 27 }]))
  mount(); await act(async () => { addButton().props.onClick({ stopPropagation: vi.fn() }) })
  expect(flights()[0].props.style).toMatchObject({ left: '179px', top: '59px', '--cart-flight-y': '414.5px' })
})
it('ignores late geometry after leaving the page', async () => {
  let measured!: (rects: unknown[]) => void
  fixture.measure.mockImplementation(callback => { measured = callback })
  mount(); act(tap)
  act(() => { for (const callback of [...fixture.hide]) callback() })
  await act(async () => { measured([{ left: 160, top: 320, width: 38, height: 38 }, { left: 12, top: 660, width: 27, height: 27 }]) })
  expect(flights()).toHaveLength(0)
  expect(vi.getTimerCount()).toBe(0)
})
it('replaces the previous flight on another successful click and cancels when opening the cart', async () => {
  mount(); await act(async () => { tap() })
  act(() => { vi.advanceTimersByTime(300) })
  await act(async () => { tap() })
  act(() => { vi.advanceTimersByTime(300) })
  expect(flights()).toHaveLength(1)
  expect(target().props.className).not.toContain('is-receiving')
  act(() => tree!.root.findByProps({ id: 'shop-cart-dock' }).props.onClick())
  expect(flights()).toHaveLength(0)
  expect(vi.getTimerCount()).toBe(0)
})
it('still adds the product if animation geometry is unavailable', async () => {
  fixture.measure.mockImplementation(callback => callback([null, null]))
  mount(); await act(async () => { tap() })
  expect(fixture.add).toHaveBeenCalledExactlyOnceWith(fixture.product)
  expect(flights()).toHaveLength(0)
})
it('keeps the local cart entry available while the catalog request is still pending', () => {
  fixture.catalogReady = false; mount()
  expect(tree!.root.findByProps({ id: 'shop-cart-dock' }).props.disabled).not.toBe(true)
})
