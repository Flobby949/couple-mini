import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { actOnOrder, getOrder } from '../../../features/orders/api'
import { ProductSummary } from '../../../features/catalog/components'
import { actionNames, cancellationPreview, historyNames, statuses } from '../../../features/orders/presentation'
import { SubscriptionCard } from '../../../features/notifications/subscription-card'
import type { OrderAction, OrderReceipt } from '../../../contracts/commerce'
import { keys } from '../../../core/query'
import { beijingTime } from '../../../core/values'
import { useReminderAction } from '../../../features/notifications/use-reminder-action'
import { pending } from '../../../core/operations'
import { navigate } from '../../../platform'
import { Icon, PersonRow } from '../../../ui/visual'
import { ErrorState, Loading, Notice } from '../../../ui'

export default function OrderDetailPage() {
  const gate = useGate(), id = useRouter().params.id || '', action = useReminderAction(gate.allowed)
  const [confirm, setConfirm] = useState<OrderAction>(), [receipt, setReceipt] = useState<OrderReceipt>()
  const query = useQuery({ queryKey: keys.order(id), queryFn: () => getOrder(id), enabled: gate.allowed && !!id, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  const data = gate.allowed ? query.data : undefined, order = data?.order
  const me = gate.data?.me.id || ''
  const preview = order && data ? cancellationPreview(order, me, data.balance) : undefined
  const sellerCancel = confirm === 'cancel' && order?.sellerId === me && order.status !== 'pending'
  const confirmText = sellerCancel ? `确认取消并扣 ${preview!.penalty} 积分` : confirm === 'request_cancel' ? '确认申请，等待店主处理' : confirm === 'confirm' ? '确认收货' : confirm ? `确认${actionNames[confirm]}` : ''
  function execute() {
    if (!confirm) return
    void action.run(() => actOnOrder(id, confirm), result => { setReceipt(result); setConfirm(undefined) })
  }
  return <Page title='这一份心意的进度' subtitle='积分与约定，始终以下单时的内容为准。'>
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!id ? <Notice>订单入口缺少标识，请返回后重新打开。</Notice> : !data && !query.error && !gate.error ? <Loading /> : order && data && <>
      <View className='row order-heading'><Text className='tag'>{me === order.buyerId ? '下单方' : '店主'} · {order.cancelPending ? '取消申请待处理' : statuses[order.status] || '状态待更新'}</Text><Button className='text-button' onClick={() => void navigate('/packages/commerce/orders/index')}>全部订单 ›</Button></View>
      <Text className='order-status-title'>{order.cancelPending?me===order.buyerId?'等待店主处理你的申请':'伴侣申请取消，等你处理':order.status==='awaiting_receipt'?me===order.buyerId?'等你确认这份心意':'等待对方确认收货':order.status==='completed'?'这份心意已完成':statuses[order.status]}</Text>
      <View className='surface product-detail'><ProductSummary product={order.snapshot} /><Text className='description'>{order.snapshot.description || '暂无额外兑现说明'}</Text><Text className='muted'>订单实扣 {order.snapshot.price} 积分 · 固定 1 份</Text></View>
      {order.cancelPending && <Notice><Text className='section-title'>{me===order.buyerId?'等待店主处理取消申请':'伴侣申请取消订单'}</Text><Text>期间不提交已兑现，也不自动确认收货。同意后原额退还 {order.snapshot.price} 积分并返还 1 份库存。</Text></Notice>}
      {order.status==='awaiting_receipt'&&!order.cancelPending&&<View className='surface'><PersonRow user={gate.data!.me.id===order.sellerId?gate.data!.me:gate.data!.partner!} partnerId={order.buyerId} title={me===order.sellerId?'已向对方提交兑现':'店主已提交兑现'} description={me===order.sellerId?'等待下单方确认收货；对方可以确认或驳回。':'已完成并提交了这份心意，请确认是否收到。'}/></View>}
      {order.autoConfirmAt && !order.cancelPending && order.status === 'awaiting_receipt' && <View className='surface deadline'><Text className='section-title'><Icon name='clock' tone='primary' size={21}/> 自动确认时间</Text><Text>{beijingTime(order.autoConfirmAt)} 北京时间</Text><Text className='muted'>驳回后本轮失效，重提后重新计算三天。</Text></View>}
      {(order.status === 'cancelled' || order.status === 'rejected') && <View className='receipt'><Text className='section-title'>{order.refunded === 0 ? '本单为 0 积分，无需退分，已返还 1 份库存' : `已退还 ${order.refunded} 积分，返还 1 份库存`}</Text><Text>{order.endedReason === 'seller_cancelled' ? `店主另扣 ${order.penalty} 积分并入池` : '本次没有取消罚分'}</Text></View>}
      {receipt && <View className='receipt'><Text className='section-title'>{receipt.action === 'request_cancel' ? '取消申请已提交，尚未退款' : '本次操作已完成'}</Text><Text>{actionNames[receipt.action as OrderAction] || receipt.action}</Text>{['cancel','reject','approve_cancel'].includes(receipt.action) && <><Text>实际退还 {receipt.refunded} · 取消罚分 {receipt.penalty} 积分</Text><Text>本次操作后我的余额 {me === order.buyerId ? receipt.buyerBalance : receipt.sellerBalance} 积分</Text></>}</View>}
      <View className='order-actions'>{order.allowedActions.filter(name => !!actionNames[name]).map((name, index) => <Button key={name} className={`button ${index === 0 ? '' : 'secondary'}`} disabled={action.busy || !!pending()} onClick={() => setConfirm(name)}>{name === 'cancel' && me === order.sellerId ? '店主主动取消' : actionNames[name]}</Button>)}</View>
      {['pending','fulfilling','awaiting_receipt'].includes(order.status)&&<SubscriptionCard enabled={gate.allowed} group='订单' disabled={action.busy||!!confirm}/>}
      <Text className='section-title section-heading'>订单进度</Text>
      <View className='timeline'>{data.history.map(event => <View className='timeline-row' key={event.id}><Text className='timeline-dot'>•</Text><View><Text className='section-title'>{historyNames[event.action] || '订单状态已更新'}</Text><Text className='muted'>{event.actorId === null ? '系统' : event.actorId === me ? '我' : '伴侣'} · {beijingTime(event.occurredAt)} 北京时间</Text></View></View>)}</View>
      {confirm && <View className='sheet-backdrop' onClick={() => { if (!action.busy) setConfirm(undefined) }}><View className='sheet' role='dialog' ariaLabel={actionNames[confirm]} onClick={e => e.stopPropagation()}><Text className='section-title'>{sellerCancel ? '确定取消这笔订单？' : confirm === 'confirm' ? '确认收货？' : `确认${actionNames[confirm]}？`}</Text><ProductSummary product={order.snapshot} />
        {sellerCancel ? <><View className='surface consequence-rows'><View><Text>退还对方</Text><Text>{preview!.refund} 积分</Text></View><View><Text>返还库存</Text><Text>1 份</Text></View><View><Text>你的取消罚分</Text><Text className='danger-text'>{preview!.penalty} 积分</Text></View><View><Text>你的余额</Text><Text>{data.balance} → <Text className='danger-text'>{preview!.balanceAfter}</Text></Text></View></View><Text>{preview!.refund === 0 ? '本单为 0 积分，无需退分，仍返还 1 份库存。' : `退对方 ${preview!.refund} 积分，返还 1 份库存。`}你的取消罚分 {preview!.penalty} 积分。</Text><Text className='warning-text'>你的余额预计 {data.balance} → {preview!.balanceAfter}。罚分入池，余额可扣为负，实际结果以服务端回执为准。</Text></> : confirm === 'request_cancel' ? <Text>申请需店主同意，当前不会退款；等待期间暂停提交兑现和自动收货。</Text> : confirm === 'cancel' || confirm === 'reject' || confirm === 'approve_cancel' ? <Text>{order.snapshot.price === 0 ? '本单为 0 积分，无需退分，仍返还 1 份库存，不罚分。' : `将退还原实扣 ${order.snapshot.price} 积分并返还 1 份库存，不罚分。`}</Text> : confirm === 'deny_cancel' ? <Text>将恢复原订单阶段；如原为待确认收货，会从本次拒绝时重新给予三天。</Text> : confirm === 'fulfill' ? <Text>提交后由下单方确认收货；三天未处理会自动确认。</Text> : confirm === 'reject_fulfillment' ? <Text>订单将回到待兑现，本轮自动确认失效。</Text> : <Text>请确认双方已经按约定处理这份心意。</Text>}
        <ErrorState error={action.error} /><View className='actions modal-actions'><Button className='button' loading={action.busy} disabled={action.busy || !order.allowedActions.includes(confirm) || !!pending()} onClick={execute}>{confirmText}</Button><Button className='button secondary' disabled={action.busy} onClick={() => setConfirm(undefined)}>先不操作</Button></View>
      </View></View>}
    </>}
  </Page>
}
