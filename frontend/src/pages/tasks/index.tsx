import { useArtwork } from '../../ui/use-artwork'
/* Approved v2 board 01: task type tabs, shared budget, responsibility filters, compact task rows. */
import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { Empty, ErrorState, Loading } from '../../ui'
import { Icon } from '../../ui/visual'
import { getTasks } from '../../features/tasks/api'
import { taskStatus } from '../../features/tasks/presentation'
import { getHome } from '../../features/home/api'
import { keys } from '../../core/query'
import { navigate } from '../../platform'
import type { TaskKind } from '../../contracts/tasks'
import { beijingTime } from '../../core/values'
export default function Tasks(){
 const { emptyTasks: empty, pointsJar: jar } = useArtwork()
 const gate=useGate(),[kind,setKind]=useState<TaskKind>('joint'),[filter,setFilter]=useState('todo')
 const budget=useQuery({queryKey:keys.home,queryFn:getHome,enabled:gate.allowed,refetchInterval:gate.allowed?30000:false})
 const query=useInfiniteQuery({queryKey:keys.tasks(kind,filter),queryFn:({pageParam})=>getTasks(kind,filter,pageParam),initialPageParam:'',getNextPageParam:last=>last.nextCursor||undefined,enabled:gate.allowed,staleTime:0,refetchInterval:gate.allowed?30000:false})
 const items=query.data?.pages.flatMap(p=>p.items)
 return <Page messageEntry title='任务'>
  <View className='task-tabs'>{(['joint','partner'] as const).map(value=><Button key={value} className={`task-tab ${kind===value?'selected':''}`} onClick={()=>setKind(value)}>{value==='joint'?'共同任务':'伴侣任务'}</Button>)}<Button className='button small task-tab' onClick={()=>void navigate(`/packages/tasks/edit/index?kind=${kind}`)}>＋ 新建</Button></View>
  {gate.allowed&&budget.data&&<View className='task-budget-row' onClick={()=>void navigate('/packages/account/history/index')}><Image className='budget-jar' src={jar} mode='aspectFit'/><View className='row'><Text className='section-title'>共同积分池</Text><Text className='muted'>可用 <Text className='primary-text'>{budget.data.points.available}</Text> · 已预留 {budget.data.points.reserved}</Text></View><Icon name='chevron' tone='muted' size={16}/></View>}
  <View className='filter-options'>{[{value:'todo',label:'待我处理'},{value:'active',label:'进行中'},{value:'history',label:'历史'}].map(f=><Button key={f.value} className={`filter-option ${filter===f.value?'selected':''}`} onClick={()=>setFilter(f.value)}>{f.label}</Button>)}</View>
  <ErrorState error={gate.error||budget.error||query.error} retry={()=>{void gate.refetch();void budget.refetch();void query.refetch()}}/>
  {(!gate.allowed||!items)&&!query.error&&<Loading/>}
  {gate.allowed&&items?.length===0&&<Empty image={empty} title={filter==='todo'?'暂时没有待处理的任务':'这里还没有任务'} description='发起一份小约定，一起把日常过得更温柔。'/>}
  {gate.allowed&&items?.map(t=><View className='surface task-card' key={t.id}><View className='task-thumb'><Icon name='task' tone='primary' size={38}/></View><View className='task-card-copy'><View className='row'><Text className='section-title'>{t.name}</Text><Text className={`tag ${['pending','awaiting'].includes(t.status)?'warning':''}`}>{taskStatus(t)}</Text></View><Text className='muted'>{t.kind==='joint'?'每人':'奖励'} <Text className='primary-text'>{t.reward}</Text> 积分 · {t.effectiveDeadline?`${beijingTime(t.effectiveDeadline)} 截止`:'不限时'}</Text><Text className='muted'>{t.cancelRequest?'取消申请待处理，主流程仍可继续':t.status==='awaiting'?'另一方已提交完成':t.status==='pending'?'等待接受这份约定':t.status==='active'?'按约定一起完成':'查看这份约定的结果'}</Text><View className='task-card-footer'><Button className='button small' onClick={()=>void navigate(`/packages/tasks/detail/index?id=${t.id}`)}>{t.allowedActions.includes('confirm')?'查看并确认':t.allowedActions.includes('accept')?'查看邀请':'查看任务'}</Button></View></View></View>)}
  {gate.allowed&&query.hasNextPage&&<Button className='button secondary' disabled={query.isFetchingNextPage} loading={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()}>加载更多任务</Button>}
 </Page>
}
