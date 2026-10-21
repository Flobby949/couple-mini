import { ApiError, request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { AccountHistory, OrderAction, OrderDetail, OrderPage, OrderReceipt } from '../../contracts/commerce'
export const placeOrder = (productId: string, confirmedPrice: number) => mutate<OrderReceipt>('/orders', { productId, confirmedPrice: String(confirmedPrice) })
export const getOrders = (role: 'buyer' | 'seller', status: string, cursor = '') => request<OrderPage>(`/orders?role=${role}&status=${encodeURIComponent(status)}&cursor=${encodeURIComponent(cursor)}`)
export async function getOrder(id: string) {
  const data = await request<OrderDetail>(`/orders/${encodeURIComponent(id)}`)
  if (!data?.order || !['pending','fulfilling','awaiting_receipt','completed','rejected','cancelled'].includes(data.order.status) || !Array.isArray(data.order.allowedActions)) throw new ApiError('INCOMPATIBLE_RESPONSE', '订单状态暂时无法识别，请更新或重新读取', 0)
  return data
}
export const actOnOrder = (id: string, action: OrderAction) => mutate<OrderReceipt>(`/orders/${encodeURIComponent(id)}/actions`, { action })
export const getAccountHistory = () => request<AccountHistory>('/points/history')
