import { ApiError, request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { AccountHistory, OrderAction, OrderCounts, OrderDetail, OrderPage, OrderReceipt } from '../../contracts/commerce'
export const placeOrder = (productId: string, confirmedPrice: number) => mutate<OrderReceipt>('/orders', { productId, confirmedPrice: String(confirmedPrice) })
export const getOrders = (role: 'buyer' | 'seller', status: string, cursor = '') => request<OrderPage>(`/orders?role=${role}&status=${encodeURIComponent(status)}&cursor=${encodeURIComponent(cursor)}`)
export async function getOrderCounts(): Promise<OrderCounts> {
  const counts: OrderCounts = { buyer: { pending: 0, fulfilling: 0, awaiting_receipt: 0 }, seller: { pending: 0, fulfilling: 0, awaiting_receipt: 0 } }
  await Promise.all((['buyer', 'seller'] as const).flatMap(role => (['pending', 'fulfilling', 'awaiting_receipt'] as const).map(async status => {
    let cursor = ''
    do {
      const page = await getOrders(role, status, cursor)
      counts[role][status] += page.items.length
      cursor = page.nextCursor
    } while (cursor)
  })))
  return counts
}
export async function getOrder(id: string) {
  const data = await request<OrderDetail>(`/orders/${encodeURIComponent(id)}`)
  if (!data?.order || !['pending','fulfilling','awaiting_receipt','completed','rejected','cancelled'].includes(data.order.status) || !Array.isArray(data.order.allowedActions)) throw new ApiError('INCOMPATIBLE_RESPONSE', '订单状态暂时无法识别，请更新或重新读取', 0)
  return data
}
export const actOnOrder = (id: string, action: OrderAction) => mutate<OrderReceipt>(`/orders/${encodeURIComponent(id)}/actions`, { action })
export const getAccountHistory = () => request<AccountHistory>('/points/history')
