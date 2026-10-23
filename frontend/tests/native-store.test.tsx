import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

const state = vi.hoisted(() => ({ onSale: true, setAvailability: vi.fn(), refresh: vi.fn(), navigate: vi.fn() }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button' }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { products: [{ id: 'product', name: '拥抱', onSale: state.onSale, stock: 2 }] } }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, canShow: true, data: { me: { id: 'seller', nickname: '店主' }, partner: { id: 'buyer' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/query', () => ({ keys: { catalog: () => ['catalog'] }, refresh: state.refresh }))
vi.mock('../src/core/operations', () => ({ pending: () => undefined }))
vi.mock('../src/platform', () => ({ navigate: state.navigate }))
vi.mock('../src/features/catalog/api', () => ({ getCatalog: vi.fn(), setProductAvailability: state.setAvailability }))
vi.mock('../src/features/catalog/components', () => ({ ProductSummary: () => null }))
vi.mock('../src/ui/use-artwork', () => ({ useArtwork: () => ({}) }))
vi.mock('../src/ui/visual', () => ({ PersonRow: () => null }))
import StorePage from '../src/packages/commerce/store'

let tree: ReactTestRenderer | undefined
beforeEach(() => { vi.resetAllMocks(); state.onSale = true })
afterEach(() => { act(() => tree?.unmount()); tree = undefined })
it('lets the owner take a product off sale and put it back on sale', async () => {
  state.setAvailability.mockImplementation(async (_id, onSale) => { state.onSale = onSale })
  act(() => { tree = create(<StorePage/>) })
  expect(JSON.stringify(tree!.toJSON())).toContain('已上架')
  await act(async () => { tree!.root.findByProps({ ariaLabel: '下架拥抱' }).props.onClick() })
  expect(state.setAvailability).toHaveBeenLastCalledWith('product', false)
  expect(JSON.stringify(tree!.toJSON())).toContain('已下架')
  await act(async () => { tree!.root.findByProps({ ariaLabel: '上架拥抱' }).props.onClick() })
  expect(state.setAvailability).toHaveBeenLastCalledWith('product', true)
  expect(state.refresh).toHaveBeenCalledTimes(2)
})
it('keeps the current availability and shows the error when the update fails', async () => {
  state.setAvailability.mockRejectedValue(new Error('上下架失败，请重试'))
  act(() => { tree = create(<StorePage/>) })
  await act(async () => { tree!.root.findByProps({ ariaLabel: '下架拥抱' }).props.onClick() })
  expect(JSON.stringify(tree!.toJSON())).toContain('上下架失败，请重试')
  expect(tree!.root.findByProps({ ariaLabel: '下架拥抱' }).props.disabled).toBe(false)
})
