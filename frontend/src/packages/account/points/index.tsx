import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getAccountHistory } from '../../../features/orders/api'
import { getHome } from '../../../features/home/api'
import { keys } from '../../../core/query'
import { beijingTime } from '../../../core/values'
import { navigate } from '../../../platform'
import { Empty, ErrorState, Loading } from '../../../ui'
import { Icon } from '../../../ui/visual'

const labels: Record<string, string> = { order_spend: '商品兑换', order_refund: '订单原额退还', order_penalty: '店主主动取消罚分', task_reward: '任务实际奖励', task_timeout: '伴侣任务超时罚分', partner_gift: '伴侣赠送实际到账' }
export default function PointsPage() {
  const gate = useGate()
  const summary = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  const query = useQuery({ queryKey: keys.accountHistory, queryFn: getAccountHistory, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  return <Page title='我的每一分' subtitle='最近 100 笔个人积分变动，按北京时间展示。'>
    <ErrorState error={gate.error || summary.error || query.error} retry={() => { void gate.refetch(); void summary.refetch(); void query.refetch() }} />
    {gate.canShow && summary.data && <View className='surface account-balance'><View className='account-balance-title'><Icon name='wallet' tone='primary' size={27}/><Text>当前可消费余额</Text></View><Text><Text className='number'>{summary.data.points.balance}</Text> 积分</Text><View className='daily-quota'><View className='row'><Text>今日已获得 {summary.data.points.earned} / {summary.data.points.dailyLimit}</Text><Text>剩余 {summary.data.points.remaining}</Text></View><View className='progress'><View style={{width:`${summary.data.points.dailyLimit>0?Math.min(100,summary.data.points.earned/summary.data.points.dailyLimit*100):0}%`}}/></View></View><Text className='muted'>任务与赠送共用额度，退款不占额度</Text></View>}
    <Text className='section-title section-heading'>最近积分变动</Text>
    {!query.data && !query.error && <Loading />}
    {gate.canShow && query.data?.entries.length === 0 && <Empty title='还没有个人积分流水' description='签到全部进入共同池；任务奖励、伴侣赠送、商品消费、退款和罚分会记录在这里。' />}
    {gate.canShow && query.data?.entries.map(entry => <View className='ledger-row' key={entry.id}><View className='ledger-symbol'><Icon name={entry.reason==='partner_gift'?'gift':entry.taskId?'task':entry.reason==='order_refund'?'refund':'shop'} tone='primary'/></View><View className='ledger-copy'><Text className='section-title'>{labels[entry.reason] || '积分变动'}</Text><Text className='muted'>{beijingTime(entry.createdAt)}</Text><Button className='text-button' onClick={() => void navigate(entry.taskId ? `/packages/tasks/detail/index?id=${entry.taskId}` : entry.giftId ? `/packages/account/gift-detail/index?id=${entry.giftId}` : `/packages/commerce/order-detail/index?id=${entry.orderId}`)}>查看关联{entry.taskId ? '任务' : entry.giftId ? '赠送' : '订单'}</Button></View><View><Text className='ledger-amount'>{entry.amount > 0 ? '+' : ''}{entry.amount} 积分</Text><Text className='muted'>变动后 {entry.balanceAfter}</Text></View></View>)}
  </Page>
}
