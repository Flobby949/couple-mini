/* THESIS: 先看谁需要处理，再把约定和积分说清楚。
 * OWN-WORLD: 沿用已确认的冷白/深色表面和三种语义主题色。
 * STORY: 选择任务类型，查看主阶段与独立取消申请，完成双方确认。
 * FIRST VIEWPORT: 任务类型、预算、新建入口和待办筛选在列表前。
 * FORM: 沿用 v2 任务流程；任务与订单分别解释取消、时间和结算。
 */
import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { Empty, ErrorState, Loading } from '../../ui'
import empty from '../../assets/empty-tasks.png'
import { getTasks } from '../../features/tasks/api'
import { TaskSummary } from '../../features/tasks/components'
import { getHome } from '../../features/home/api'
import { keys } from '../../core/query'
import { navigate } from '../../platform'
import type { TaskKind } from '../../contracts/tasks'

export default function Tasks() {
  const gate = useGate()
  const [kind, setKind] = useState<TaskKind>('joint'), [filter, setFilter] = useState('active')
  const budget = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  const query = useInfiniteQuery({ queryKey: keys.tasks(kind, filter), queryFn: ({ pageParam }) => getTasks(kind, filter, pageParam), initialPageParam: '', getNextPageParam: last => last.nextCursor || undefined, enabled: gate.allowed, staleTime: 0, refetchInterval: gate.allowed ? 30000 : false })
  const items = query.data?.pages.flatMap(page => page.items)
  return <Page messageEntry title='一起，把约定做好' subtitle='双方愿意，才是约定的开始。'>
    <View className='segmented'>{(['joint','partner'] as const).map(value => <Button key={value} className={kind === value ? 'selected' : ''} onClick={() => setKind(value)}>{value === 'joint' ? '共同任务' : '伴侣任务'}</Button>)}</View>
    {gate.allowed && budget.data && <View className='surface task-budget'><View><Text className='section-title'>共同任务预算</Text><Text className='muted'>可用 {budget.data.points.available} · 已预留 {budget.data.points.reserved} 积分</Text></View><Button className='button small' onClick={() => void navigate(`/packages/tasks/edit/index?kind=${kind}`)}>新建任务</Button></View>}
    <View className='filter-options'>{[{value:'todo',label:'待我处理'},{value:'active',label:'进行中'},{value:'history',label:'历史'}].map(item => <Button key={item.value} className={`text-button ${filter === item.value ? 'selected' : ''}`} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</View>
    <ErrorState error={gate.error || budget.error || query.error} retry={() => { void gate.refetch(); void budget.refetch(); void query.refetch() }} />
    {(!gate.allowed || !items) && !query.error && <Loading />}
    {gate.allowed && items?.length === 0 && <Empty image={empty} title={filter === 'todo' ? '暂时没有需要你处理的约定' : '这里还没有任务'} description='可以发起一个共同任务，或邀请伴侣完成一件小事。' />}
    {gate.allowed && items?.map(task => <View className='surface task-list-item' key={task.id}><TaskSummary task={task} />{task.cancelRequest && <Text className='warning-text'>取消申请待处理，主流程仍可继续</Text>}<Button className='button secondary' onClick={() => void navigate(`/packages/tasks/detail/index?id=${task.id}`)}>查看任务</Button></View>)}
    {gate.allowed && query.hasNextPage && <Button className='button secondary' disabled={query.isFetchingNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>加载更多任务</Button>}
  </Page>
}
