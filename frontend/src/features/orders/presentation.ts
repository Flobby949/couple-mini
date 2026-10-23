import type { Order, OrderAction, OrderCounts, OrderStatus } from '../../contracts/commerce'
export const statuses: Record<OrderStatus, string> = { pending: '待接单', fulfilling: '待兑现', awaiting_receipt: '待确认收货', completed: '已完成', rejected: '已拒绝', cancelled: '已取消' }
export const actionNames: Record<OrderAction, string> = { accept: '接受订单', reject: '拒绝订单', fulfill: '提交已兑现', confirm: '确认收货', reject_fulfillment: '驳回兑现', request_cancel: '申请取消', approve_cancel: '同意取消', deny_cancel: '拒绝取消', cancel: '取消订单' }
export const historyNames: Record<string, string> = { placed: '下单成功', ...actionNames, auto_confirm: '三天到期，系统自动确认收货' }
export function openOrderCount(counts?: OrderCounts['buyer']) { return (counts?.pending || 0) + (counts?.fulfilling || 0) + (counts?.awaiting_receipt || 0) }
export function purchaseBlock(balance: number, stock: number, price: number, onSale = true) {
  if (!onSale) return '商品已下架，暂不能下单'
  if (balance < 0) return `当前余额为 ${balance}，恢复至非负后才能下单`
  if (stock < 1) return '暂无库存，暂不能下单'
  if (balance < price) return `积分不足，当前 ${balance}，需要 ${price} 积分`
  return ''
}
export function cancellationPreview(order: Order, actor: string, balance: number) {
  const penalty = actor === order.sellerId && order.status !== 'pending' ? Math.floor((order.snapshot.price + 1) / 2) : 0
  return { refund: order.snapshot.price, penalty, balanceAfter: balance - penalty }
}
