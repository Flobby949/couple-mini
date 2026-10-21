import { useQuery } from '@tanstack/react-query'
import { Text, View } from '@tarojs/components'
import { getPoolHistory } from '../../../features/points/api'
import { useGate } from '../../../app/hooks'
import { keys } from '../../../core/query'
import { beijingTime } from '../../../core/values'
import { Page } from '../../../app/page'
import { ErrorState, Loading } from '../../../ui'
const labels: Record<string, string> = { initial: '启动积分', checkin: '签到入池', double_checkin: '双人签到奖励', milestone: '累计签到里程碑' }
export default function HistoryPage() {
  const gate = useGate()
  const query = useQuery({ queryKey: keys.history, queryFn: getPoolHistory, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  return <Page title='每一分，都有来处' subtitle='共同积分池 · 最近 100 笔记录 · 北京时间'><ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }} />{!query.data && !query.error && <Loading />}{gate.allowed && query.data?.entries.map(item => <View className='ledger-row' key={item.id}><View><Text className='section-title'>{labels[item.reason] || item.reason}</Text><Text className='muted'>{beijingTime(item.createdAt)}</Text></View><Text className='ledger-amount'>+{item.amount} 积分</Text></View>)}</Page>
}
