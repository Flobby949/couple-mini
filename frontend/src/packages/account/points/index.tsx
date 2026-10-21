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

const labels: Record<string, string> = { order_spend: '商品兑换', order_refund: '订单原额退还', order_penalty: '店主主动取消罚分' }
export default function PointsPage() {
  const gate = useGate()
  const summary = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  const query = useQuery({ queryKey: keys.accountHistory, queryFn: getAccountHistory, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  return <Page title='我的每一分' subtitle='最近 100 笔个人积分变动，按北京时间展示。'>
    <ErrorState error={gate.error || summary.error || query.error} retry={() => { void gate.refetch(); void summary.refetch(); void query.refetch() }} />
    {gate.allowed && summary.data && <View className='surface'><Text className='muted'>当前可消费余额</Text><Text className='number'>{summary.data.points.balance} 积分</Text><Text className='muted'>今日已获得 {summary.data.points.earned} / {summary.data.points.dailyLimit}，剩余 {summary.data.points.remaining}。退款不占获得额度。</Text></View>}
    {!query.data && !query.error && <Loading />}
    {gate.allowed && query.data?.entries.length === 0 && <Empty title='还没有个人积分流水' description='签到全部进入共同池；商品消费、退款和罚分会记录在这里。' />}
    {gate.allowed && query.data?.entries.map(entry => <View className='ledger-row' key={entry.id}><View><Text className='section-title'>{labels[entry.reason] || entry.reason}</Text><Text className='muted'>{beijingTime(entry.createdAt)}</Text><Button className='text-button' onClick={() => void navigate(`/packages/commerce/order-detail/index?id=${entry.orderId}`)}>查看关联订单</Button></View><View><Text className='ledger-amount'>{entry.amount > 0 ? '+' : ''}{entry.amount} 积分</Text><Text className='muted'>变动后 {entry.balanceAfter}</Text></View></View>)}
  </Page>
}
