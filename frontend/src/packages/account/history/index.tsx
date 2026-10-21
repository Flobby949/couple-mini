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
const labels: Record<string, string> = { initial: '启动积分', checkin: '签到入池', double_checkin: '双人签到奖励', milestone: '累计签到里程碑', order_cancel_penalty: '店主取消罚分入池', task_reward: '任务实际奖励支出', task_timeout_penalty: '伴侣任务超时罚分入池' }
export default function HistoryPage() {
  const gate = useGate(), [view, setView] = useState<'flows'|'reservations'>('flows')
  const query = useQuery({ queryKey: keys.history, queryFn: getPoolHistory, enabled: gate.allowed && view === 'flows', refetchInterval: gate.allowed && view === 'flows' ? 15000 : false })
  const reserved = useQuery({ queryKey: keys.reservations, queryFn: getReservations, enabled: gate.allowed && view === 'reservations', staleTime: 0, refetchInterval: gate.allowed && view === 'reservations' ? 15000 : false })
  const summary = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  return <Page title='每一分，都有来处' subtitle='共同积分池 · 最近 100 笔记录 · 北京时间'>
    <ErrorState error={gate.error || query.error || reserved.error || summary.error} retry={() => { void gate.refetch(); void summary.refetch(); if (view === 'flows') void query.refetch(); else void reserved.refetch() }} />
    {gate.allowed && summary.data && <View className='surface'><Text className='section-title'>共同积分池 {summary.data.points.total} 积分</Text><Text className='muted'>可用 {summary.data.points.available} + 预留 {summary.data.points.reserved} = 总额</Text></View>}
    <View className='segmented'><Button className={view === 'flows' ? 'selected' : ''} onClick={() => setView('flows')}>收支流水</Button><Button className={view === 'reservations' ? 'selected' : ''} onClick={() => setView('reservations')}>任务预留</Button></View>
    {gate.allowed && view === 'flows' && <>{!query.data && !query.error && <Loading />}{query.data?.entries.map(item => <View className='ledger-row' key={item.id}><View><Text className='section-title'>{labels[item.reason] || '积分池变动'}</Text><Text className='muted'>{beijingTime(item.createdAt)}</Text>{item.taskId && <Button className='text-button' onClick={() => void navigate(`/packages/tasks/detail/index?id=${item.taskId}`)}>查看关联任务</Button>}</View><Text className='ledger-amount'>{item.amount > 0 ? '+' : ''}{item.amount} 积分</Text></View>)}</>}
    {gate.allowed && view === 'reservations' && <>{!reserved.data && !reserved.error && <Loading />}<Text className='section-title section-heading'>当前任务承诺</Text>{reserved.data?.items.length === 0 && <Empty title='暂时没有任务预留' description='任务发布时先预留奖励，结束后结算或释放。' />}{reserved.data?.items.map(item => <View className='surface task-list-item' key={item.taskId}><Text className='section-title'>{item.name}</Text><Text>已预留 {item.amount} 积分{item.kind === 'joint' ? `（双方合计，每人 ${item.reward}）` : ''}</Text><Button className='text-button' onClick={() => void navigate(`/packages/tasks/detail/index?id=${item.taskId}`)}>查看任务</Button></View>)}<Text className='section-title section-heading'>预留变动记录</Text><Text className='muted'>只在可用与预留之间移动，不是额外新增积分。实际奖励支出见收支流水。</Text>{reserved.data?.history.map(item => <View className='ledger-row' key={item.id}><View><Text>{item.name}</Text><Text className='muted'>{beijingTime(item.occurredAt)} · {item.reason === 'reserve' ? item.delta >= 0 ? '预留增加' : '接受前编辑释放' : item.reason === 'settled' ? '结算并结束预留' : '任务结束，释放预留'}</Text><Button className='text-button' onClick={() => void navigate(`/packages/tasks/detail/index?id=${item.taskId}`)}>查看任务</Button></View><Text>{item.delta > 0 ? '+' : ''}{item.delta} 预留</Text></View>)}</>}
  </Page>
}
