import { afterEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const fixture = vi.hoisted(() => ({
  back: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined), save: vi.fn().mockResolvedValue({ id: 'product' }), choose: vi.fn(), upload: vi.fn(),
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
vi.mock('../src/platform/media', () => ({ chooseProductCover: fixture.choose }))
vi.mock('../src/core/media', () => ({ uploadMedia: fixture.upload }))
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
it('keeps the saved cover and form when square cropping is cancelled', async () => {
  fixture.choose.mockRejectedValueOnce(new Error('cropImage:cancel'))
  act(() => { tree = create(<ProductEdit/>) })
  const choose = tree!.root.findAllByType('button').find(button => button.children.includes('更换照片'))!
  await act(async () => { choose.props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
  expect(fixture.upload).not.toHaveBeenCalled()
  const save = tree!.root.findAllByType('button').find(button => button.children.includes('保存商品'))!
  expect(save.props.disabled).toBe(false)
  await act(async () => { save.props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
  expect(fixture.save).toHaveBeenCalledWith('product', expect.objectContaining({ coverId: 'cover', name: '本地心意' }))
})
const control = (label: string) => tree!.root.findByProps({ ariaLabel: label })
const input = (label: string, value: string) => act(() => control(label).props.onInput({ detail: { value } }))
const click = (label: string) => act(() => control(label).props.onClick())
it('adjusts price and stock independently and saves their new values', async () => {
  act(() => { tree = create(<ProductEdit/>) })
  click('增加积分价格')
  click('增加积分价格')
  click('减少积分价格')
  click('增加库存')
  click('减少库存')
  click('减少库存')
  expect(control('积分价格').props.value).toBe('1')
  expect(control('可兑换库存').props.value).toBe('1')
  const save = tree!.root.findAllByType('button').find(button => button.children.includes('保存商品'))!
  await act(async () => { save.props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
  expect(fixture.save).toHaveBeenCalledWith('product', expect.objectContaining({ price: '1', stock: 1 }))
})
it.each([
  ['积分价格', '积分价格', '1000000000'],
  ['可兑换库存', '库存', '1000000'],
])('keeps %s within its limits and allows starting from an empty input', (label, buttons, max) => {
  act(() => { tree = create(<ProductEdit/>) })
  input(label, '')
  expect(control(`减少${buttons}`).props.disabled).toBe(true)
  expect(control(`增加${buttons}`).props.disabled).toBe(false)
  click(`增加${buttons}`)
  expect(control(label).props.value).toBe('1')
  click(`减少${buttons}`)
  expect(control(label).props.value).toBe('0')
  expect(control(`减少${buttons}`).props.disabled).toBe(true)
  input(label, String(Number(max) - 1))
  click(`增加${buttons}`)
  expect(control(label).props.value).toBe(max)
  expect(control(`增加${buttons}`).props.disabled).toBe(true)
  click(`减少${buttons}`)
  expect(control(label).props.value).toBe(String(Number(max) - 1))
})
it('preserves manually entered decimal prices when stepping and clamps fractional boundaries', () => {
  act(() => { tree = create(<ProductEdit/>) })
  input('积分价格', '1.123456')
  click('增加积分价格')
  expect(control('积分价格').props.value).toBe('2.123456')
  click('减少积分价格')
  expect(control('积分价格').props.value).toBe('1.123456')
  input('积分价格', '0.4')
  click('减少积分价格')
  expect(control('积分价格').props.value).toBe('0')
  input('积分价格', '999999999.4')
  click('增加积分价格')
  expect(control('积分价格').props.value).toBe('1000000000')
})
it.each([
  ['积分价格', '积分价格', '-1'],
  ['可兑换库存', '库存', '1.5'],
])('requires correcting invalid %s before stepping', (label, buttons, value) => {
  act(() => { tree = create(<ProductEdit/>) })
  input(label, value)
  expect(control(`减少${buttons}`).props.disabled).toBe(true)
  expect(control(`增加${buttons}`).props.disabled).toBe(true)
  expect(control(label).props.value).toBe(value)
  input(label, '3')
  click(`增加${buttons}`)
  expect(control(label).props.value).toBe('4')
})
