import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { getPoolHistory } from '../../../features/points/api'
import { useGate } from '../../../app/hooks'
import { keys } from '../../../core/query'
import { getReservations } from '../../../features/points/gifts'
import { getHome } from '../../../features/home/api'
import { navigate } from '../../../platform'
import { beijingTime } from '../../../core/values'
import { Page } from '../../../app/page'
import { Empty, ErrorState, Loading } from '../../../ui'
import { BudgetCard, Icon, InlineInfo } from '../../../ui/visual'
const labels: Record<string, string> = { initial: '启动积分', checkin: '签到入池', double_checkin: '双人签到奖励', milestone: '累计签到里程碑', order_cancel_penalty: '店主取消罚分入池', task_reward: '任务实际奖励支出', task_timeout_penalty: '伴侣任务超时罚分入池' }
export default function HistoryPage() {
  const gate = useGate(), [view, setView] = useState<'flows'|'reservations'>('flows')
  const query = useQuery({ queryKey: keys.history, queryFn: getPoolHistory, enabled: gate.allowed && view === 'flows', refetchInterval: gate.allowed && view === 'flows' ? 15000 : false })
  const reserved = useQuery({ queryKey: keys.reservations, queryFn: getReservations, enabled: gate.allowed && view === 'reservations', staleTime: 0, refetchInterval: gate.allowed && view === 'reservations' ? 15000 : false })
  const summary = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  return <Page title='每一分，都有来处' subtitle='共同积分池 · 最近 100 笔记录 · 北京时间'>
    <ErrorState error={gate.error || query.error || reserved.error || summary.error} retry={() => { void gate.refetch(); void summary.refetch(); if (view === 'flows') void query.refetch(); else void reserved.refetch() }} />
    {gate.canShow && summary.data && <BudgetCard><Text className='section-title'>共同积分池</Text><Text><Text className='number'>{summary.data.points.total}</Text> 积分</Text><Text className='muted'>可用 <Text className='primary-text'>{summary.data.points.available}</Text> · 已预留 {summary.data.points.reserved}</Text></BudgetCard>}
    <View className='segmented'><Button className={`segment-option ${view === 'flows' ? 'selected' : ''}`} onClick={() => setView('flows')}>收支流水</Button><Button className={`segment-option ${view === 'reservations' ? 'selected' : ''}`} onClick={() => setView('reservations')}>任务预留</Button></View>
    {gate.canShow && view === 'flows' && <>{!query.data && !query.error && <Loading />}{query.data?.entries.map(item => <View className='ledger-row' key={item.id}><View className='ledger-symbol'><Icon name={item.amount>0?'coins':'task'} tone='primary'/></View><View className='ledger-copy'><Text className='section-title'>{labels[item.reason] || '积分池变动'}</Text><Text className='muted'>{beijingTime(item.createdAt)}</Text>{item.taskId && <Button className='text-button' onClick={() => void navigate(`/packages/tasks/detail/index?id=${item.taskId}`)}>查看关联任务</Button>}</View><Text className='ledger-amount'>{item.amount > 0 ? '+' : ''}{item.amount} 积分</Text></View>)}</>}
    {gate.canShow && view === 'reservations' && <>{!reserved.data && !reserved.error && <Loading />}<View className='row section-heading'><Text className='section-title'>当前任务承诺</Text><Text className='primary-text'>合计 {summary.data?.points.reserved??'…'} 积分</Text></View>{reserved.data?.items.length === 0 && <Empty title='暂时没有任务预留' description='任务发布时先预留奖励，结束后结算或释放。' />}{reserved.data?.items.map(item => <Button className='surface reservation-row' key={item.taskId} onClick={()=>void navigate(`/packages/tasks/detail/index?id=${item.taskId}`)}><View className='ledger-symbol'><Icon name='task' tone='primary'/></View><View><Text className='section-title'>{item.name}</Text><Text className='muted'>{item.kind==='joint'?`共同任务 · 每人 ${item.reward}`:'伴侣任务'}</Text></View><Text className='price'>{item.amount}<Text className='points-unit'> 积分</Text></Text><Icon name='chevron' size={16} tone='muted'/></Button>)}<Text className='section-title section-heading'>预留变动记录</Text><InlineInfo>预留只在可用与预留之间移动，不额外新增积分。任务结束后结算或释放，实际奖励支出见收支流水。</InlineInfo>{reserved.data?.history.map(item => <View className='ledger-row' key={item.id}><View><Text>{item.name}</Text><Text className='muted'>{beijingTime(item.occurredAt)} · {item.reason === 'reserve' ? item.delta >= 0 ? '预留增加' : '接受前编辑释放' : item.reason === 'settled' ? '结算并结束预留' : '任务结束，释放预留'}</Text><Button className='text-button' onClick={() => void navigate(`/packages/tasks/detail/index?id=${item.taskId}`)}>查看任务</Button></View><Text>{item.delta > 0 ? '+' : ''}{item.delta} 预留</Text></View>)}</>}
  </Page>
}
