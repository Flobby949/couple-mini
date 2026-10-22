import { afterEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { OrderDetail } from '../src/contracts/commerce'
const fixture = vi.hoisted(() => ({ actor: 'seller', detail: undefined as unknown as OrderDetail }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button' }))
vi.mock('@tarojs/taro', () => ({ useRouter: () => ({ params: { id: 'order' } }) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: fixture.detail, refetch: vi.fn() }) }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ allowed: true, canShow: true, data: { me: { id: fixture.actor, nickname: '我' }, partner: { id: fixture.actor === 'seller' ? 'buyer' : 'seller', nickname: '伴侣' } } }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/features/notifications/use-reminder-action', () => ({ useReminderAction: () => ({ busy: false, error: null, run: vi.fn() }) }))
vi.mock('../src/core/query', () => ({ keys: { order: (id: string) => ['order', id] } }))
vi.mock('../src/core/operations', () => ({ pending: () => undefined }))
vi.mock('../src/platform', () => ({ navigate: vi.fn() }))
vi.mock('../src/features/orders/api', () => ({ actOnOrder: vi.fn(), getOrder: vi.fn() }))
vi.mock('../src/features/catalog/components', () => ({ ProductSummary: () => null }))
vi.mock('../src/features/notifications/subscription-card', () => ({ SubscriptionCard: () => null }))
vi.mock('../src/ui/visual', () => ({ Icon: () => null, PersonRow: (props: object) => <div {...props}/> }))
import OrderDetailPage from '../src/packages/commerce/order-detail'
let tree: ReactTestRenderer | undefined
function render(actor: 'seller' | 'buyer', cancelPending: boolean) {
  fixture.actor = actor
  fixture.detail = { order: { id: 'order', buyerId: 'buyer', sellerId: 'seller', productId: 'product', snapshot: { name: '约定', price: 5, coverId: 'cover', description: '' }, status: 'awaiting_receipt', cancelPending, autoConfirmAt: null, refunded: 0, penalty: 0, endedReason: '', createdAt: '', updatedAt: '', allowedActions: cancelPending ? actor === 'seller' ? ['approve_cancel', 'deny_cancel', 'cancel'] : [] : actor === 'buyer' ? ['confirm', 'reject_fulfillment', 'request_cancel'] : ['cancel'] }, balance: 0, serverTime: '', history: [] }
  act(() => { tree = create(<OrderDetailPage/>) })
  return tree!.root.findAllByType('text').flatMap(node => node.children.filter(child => typeof child === 'string')).join(' ')
}
afterEach(() => { act(() => tree?.unmount()); tree = undefined })
it('asks the seller to handle the partner cancellation rather than wait for themselves', () => {
  const text = render('seller', true)
  expect(text).toContain('伴侣申请取消，等你处理')
  expect(text).toContain('伴侣申请取消订单')
  expect(text).not.toContain('等待店主处理你的申请')
  expect(tree!.root.findAllByType('button').some(button => button.children.includes('同意取消'))).toBe(true)
})
it('keeps the buyer cancellation view waiting for the seller with no decision actions', () => {
  expect(render('buyer', true)).toContain('等待店主处理你的申请')
  expect(tree!.root.findAllByType('button').some(button => button.children.includes('同意取消'))).toBe(false)
})
it('describes submitted fulfillment from the seller perspective', () => {
  render('seller', false)
  expect(tree!.root.findByType('div').props.title).toBe('已向对方提交兑现')
  expect(tree!.root.findByType('div').props.description).toBe('等待下单方确认收货；对方可以确认或驳回。')
})
