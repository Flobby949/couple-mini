/* THESIS: 在一条时间流中读懂两个人的回应。
 * OWN-WORLD: 延续双人签到台的语义色、明暗表面与清楚的中文层级。
 * STORY: 查看未读、阅读完整正文，再进入业务当前状态。
 * FIRST VIEWPORT: 标题、未读数、筛选和已读操作后接事件流。
 * FORM: 使用已确认 N01 流程，模板设置独立进入。
 */
import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getMessages, getUnread, readAllMessages } from '../../../features/notifications/api'
import { keys } from '../../../core/query'
import { useAction } from '../../../core/use-action'
import { pending } from '../../../core/operations'
import { beijingTime } from '../../../core/values'
import { navigate, switchTab } from '../../../platform'
import { Empty, ErrorState, Loading } from '../../../ui'
import { Icon } from '../../../ui/visual'

export default function MessagesPage() {
  const gate = useGate(), [filter, setFilter] = useState('all'), action = useAction(), [result,setResult] = useState('')
  const unread = useQuery({ queryKey: keys.unread, queryFn: getUnread, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  const query = useInfiniteQuery({ queryKey: keys.messages(filter), queryFn: ({pageParam}) => getMessages(filter,pageParam), initialPageParam: '', getNextPageParam: last => last.nextCursor || undefined, enabled: gate.allowed, staleTime: 0, refetchInterval: gate.allowed ? 30000 : false })
  const items = Array.from(new Map(query.data?.pages.flatMap(p => p.items).map(m => [m.id,m])).values())
  return <Page title='每个回应，都在这里' subtitle='按事情发生的时间排列，晚到的消息仍会保留未读。'>
    <View className='messages-toolbar'><Text className='muted'>{unread.data?.count ?? '…'} 条未读消息</Text><Button className='text-button' disabled={!gate.allowed || action.busy || !!pending() || !unread.data?.count} onClick={() => void action.run(readAllMessages,r => setResult(`已将本次收到的 ${r.read} 条消息标为已读。`))}>全部已读</Button></View>
    <View className='segmented messages-tabs'>{[['all','全部'],['unread','未读']].map(([value,label]) => <Button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</Button>)}</View>
    {result && <Text className='muted'>{result}</Text>}
    <ErrorState error={gate.error || query.error || unread.error || action.error} retry={() => { void gate.refetch(); void query.refetch(); void unread.refetch() }} />
    {!query.data && !query.error && <Loading />}
    {gate.allowed && query.data && items.length === 0 && <Empty title={filter === 'unread' ? '收到的回应，都已读过' : '还没有站内消息'} description='业务成功后消息可能稍后到达；通知开关不影响首页待办。' />}
    <View className='messages-list'>{gate.allowed && items.map(m => <Button className={`message-row ${!m.readAt?'is-unread':''}`} key={m.id} onClick={() => void navigate(`/packages/account/message-detail/index?id=${m.id}`)}><View className='message-symbol'><Icon name={m.target.type==='task'?'task':m.target.type==='order'?'order':m.target.type==='gift'?'gift':'bell'} tone='primary'/>{!m.readAt&&<View className='unread-dot'/>}</View><View className='message-copy'><View className='row'><Text className='section-title'>{m.title}</Text><Text className='muted'>{beijingTime(m.occurredAt)}</Text></View><Text className='message-excerpt'>{m.body}</Text></View><Icon name='chevron' size={16} tone='muted'/></Button>)}</View>
    {gate.allowed && query.hasNextPage && <Button className='button secondary' loading={query.isFetchingNextPage} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>查看更早的消息</Button>}
    <Button className='text-button' onClick={() => void navigate('/packages/account/notification-settings/index')}>提醒偏好 <Icon name='settings' size={16} tone='primary'/></Button>
    <Button className='text-button' onClick={() => void switchTab('/pages/home/index')}>返回首页</Button>
  </Page>
}
