import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const fixture = vi.hoisted(() => ({ remaining: 3 }))
vi.mock('@tarojs/components', () => ({ Button: 'button', Input: 'input', Text: 'text', View: 'view' }))
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'gift-preview' ? { singleMax: 20, sendsRemaining: fixture.remaining, receiverRemaining: 100 } : { items: [] } }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, data: { me: { id: 'buyer' }, partner: { id: 'seller', nickname: '伴侣' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/query', () => ({ keys: { giftPreview: ['gift-preview'], gifts: ['gifts'] } }))
vi.mock('../src/core/use-action', () => ({ useAction: () => ({ busy: false, run: vi.fn() }) }))
vi.mock('../src/core/operations', () => ({ pending: () => undefined }))
vi.mock('../src/features/points/gifts', () => ({ getGiftPreview: vi.fn(), getGifts: vi.fn(), sendGift: vi.fn() }))
vi.mock('../src/platform', () => ({ navigate: vi.fn() }))
vi.mock('../src/ui/visual', () => ({ PersonRow: () => null, InlineInfo: () => null, Icon: () => null }))
import GiftPage from '../src/packages/account/gift'
let tree: ReactTestRenderer | undefined
function enter(value: string) {
  act(() => { tree = create(<GiftPage/>) })
  act(() => tree!.root.findByType('input').props.onInput({ detail: { value } }))
  return tree!.root.findAllByType('text').flatMap(text => text.children.filter(child => typeof child === 'string')).join(' ')
}
beforeEach(() => { fixture.remaining = 3 })
afterEach(() => { act(() => tree?.unmount()); tree = undefined })
it('does not promise an arrival amount for a gift exceeding the single limit', () => {
  expect(enter('21')).not.toContain('预计到账')
  expect(tree!.root.findAllByType('button').find(button => button.children.includes('确认赠送 '))!.props.disabled).toBe(true)
})
it('does not promise an arrival amount after the daily count is exhausted', () => {
  fixture.remaining = 0
  expect(enter('3')).not.toContain('预计到账')
})
it('previews a valid gift including zero', () => {
  expect(enter('0')).toContain('预计到账')
  expect(tree!.root.findAllByType('button').find(button => button.children.includes('确认赠送 '))!.props.disabled).toBe(false)
})
