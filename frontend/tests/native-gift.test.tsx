import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const fixture = vi.hoisted(() => ({ remaining: 3, pages: [] as { route: string }[], send: vi.fn(), history: false }))
vi.mock('@tarojs/components', () => ({ Button: 'button', Input: 'input', Text: 'text', View: 'view' }))
vi.mock('@tarojs/taro', () => ({ default: {
  getCurrentPages: () => fixture.pages,
  navigateTo: async ({ url }: { url: string }) => { fixture.pages.push({ route: url }) },
  redirectTo: async ({ url }: { url: string }) => { fixture.pages.splice(-1, 1, { route: url }) },
  navigateBack: async () => { fixture.pages.pop() },
} }))
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'gift-preview' ? { singleMax: 20, sendsRemaining: fixture.remaining, receiverRemaining: 100 } : { items: fixture.history ? [{ id: 'old-gift', senderId: 'buyer', createdAt: '2026-10-23T00:00:00Z', actual: 1, requested: 1, discarded: 0 }] : [] } }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, canShow: true, data: { me: { id: 'buyer' }, partner: { id: 'seller', nickname: '伴侣' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/query', () => ({ keys: { giftPreview: ['gift-preview'], gifts: ['gifts'] }, refresh: async () => {} }))
vi.mock('../src/features/notifications/use-reminder-action', async () => {
  const { useAction } = await import('../src/core/use-action')
  return { useReminderAction: useAction }
})
vi.mock('../src/core/operations', () => ({ pending: () => undefined }))
vi.mock('../src/features/points/gifts', () => ({ getGiftPreview: vi.fn(), getGifts: vi.fn(), sendGift: fixture.send }))
vi.mock('../src/ui/visual', () => ({ PersonRow: () => null, InlineInfo: () => null, Icon: () => null }))
import GiftPage from '../src/packages/account/gift'
import { back } from '../src/platform'
let tree: ReactTestRenderer | undefined
function enter(value: string) {
  act(() => { tree = create(<GiftPage/>) })
  act(() => tree!.root.findByType('input').props.onInput({ detail: { value } }))
  return tree!.root.findAllByType('text').flatMap(text => text.children.filter(child => typeof child === 'string')).join(' ')
}
beforeEach(() => {
  vi.resetAllMocks(); fixture.remaining = 3; fixture.history = false
  fixture.pages = [{ route: '/packages/account/partner/index' }, { route: '/packages/account/gift/index' }]
  fixture.send.mockResolvedValue({ id: 'gift' })
})
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
it('returns to the partner page after sending without revisiting the submitted form', async () => {
  enter('3')
  await act(async () => { tree!.root.findByProps({ className: 'button' }).props.onClick() })
  expect(fixture.send).toHaveBeenCalledExactlyOnceWith('3')
  expect(fixture.pages.at(-1)?.route).toBe('/packages/account/gift-detail/index?id=gift')
  await back()
  expect(fixture.pages).toEqual([{ route: '/packages/account/partner/index' }])
})
it('preserves the entered amount and page when sending fails', async () => {
  fixture.send.mockRejectedValueOnce(new Error('赠送失败'))
  enter('3')
  await act(async () => { tree!.root.findByProps({ className: 'button' }).props.onClick() })
  expect(fixture.pages.at(-1)?.route).toBe('/packages/account/gift/index')
  expect(tree!.root.findByType('input').props.value).toBe('3')
  expect(tree!.root.findByProps({ className: 'button' }).props.disabled).toBe(false)
})
it('keeps the gift page in history when browsing an existing gift', async () => {
  fixture.history = true
  enter('3')
  await act(async () => { tree!.root.findByProps({ className: 'text-button' }).props.onClick() })
  expect(fixture.pages.at(-1)?.route).toBe('/packages/account/gift-detail/index?id=old-gift')
  await back()
  expect(fixture.pages.at(-1)?.route).toBe('/packages/account/gift/index')
  expect(fixture.send).not.toHaveBeenCalled()
})
