import { afterEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const fixture = vi.hoisted(() => ({
  back: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined), save: vi.fn().mockResolvedValue({ id: 'product' }),
  product: { id: 'product', ownerId: 'me', name: '本地心意', description: '约定', price: 0, stock: 2, coverId: 'cover' },
}))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Input: 'input', Textarea: 'textarea', Button: 'button', Image: 'image' }))
vi.mock('@tarojs/taro', () => ({ useRouter: () => ({ params: { id: 'product' } }) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { product: fixture.product }, isFetchedAfterMount: true }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, data: { stage: 'ready', me: { id: 'me' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/query', () => ({ keys: { product: (id: string) => ['product', id] }, refresh: () => Promise.resolve() }))
vi.mock('../src/core/api', () => ({ session: () => ({ user: { id: 'me' } }) }))
vi.mock('../src/platform', () => ({ back: fixture.back, navigate: fixture.navigate }))
vi.mock('../src/platform/media', () => ({ chooseCover: vi.fn() }))
vi.mock('../src/core/media', () => ({ uploadMedia: vi.fn() }))
vi.mock('../src/features/catalog/api', () => ({ getProduct: vi.fn(), saveProduct: fixture.save }))
vi.mock('../src/features/catalog/components', () => ({ Cover: () => null }))
vi.mock('../src/ui/visual', () => ({ Icon: () => null }))
import ProductEdit from '../src/packages/commerce/product-edit'
let tree: ReactTestRenderer | undefined
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.clearAllMocks() })
it('returns to the caller after saving rather than pushing a second copy of the store route', async () => {
  act(() => { tree = create(<ProductEdit/>) })
  const button = tree!.root.findAllByType('button').find(button => button.children.includes('保存商品'))!
  await act(async () => { button.props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
  expect(fixture.save).toHaveBeenCalledOnce()
  expect(fixture.back).toHaveBeenCalledExactlyOnceWith('/packages/commerce/store/index')
  expect(fixture.navigate).not.toHaveBeenCalled()
})
