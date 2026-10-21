import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getPreferences } from '../../../features/notifications/api'
import { channelNames } from '../../../features/notifications/presentation'
import { keys } from '../../../core/query'
import { navigate } from '../../../platform'
import { ErrorState, Loading } from '../../../ui'
import { Icon, InlineInfo } from '../../../ui/visual'

export default function NotificationSettingsPage() {
  const gate = useGate(), [expanded,setExpanded]=useState<string[]>(['任务']), [allTasks,setAllTasks]=useState(false)
  const query = useQuery({ queryKey: keys.preferences, queryFn: getPreferences, enabled: gate.allowed, staleTime: 0 })
  const items = query.data?.items || []
  return <Page title='让提醒，按你的方式来'>
    <View className='surface preference-intro'><Icon name='settings' tone='primary' size={34}/><View><Text className='section-title'>只设置你自己的接收方式</Text><Text className='muted'>按每一种通知分别设置。</Text></View></View>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!query.data && !query.error && <Loading />}
    {gate.allowed && ['任务','订单','积分与签到','绑定与规则'].map(group => {
      const members=items.filter(t=>t.group===group),open=expanded.includes(group)
      const visible=group==='任务'&&!allTasks?members.filter(t=>['T01','T02','T03','T06','T10'].includes(t.code)):members
      return <View className='surface notification-group' key={group}><Button className='group-heading' ariaLabel={`${group}，${open?'已展开':'已收起'}`}  onClick={()=>setExpanded(open?expanded.filter(g=>g!==group):[...expanded,group])}><Icon name={group==='任务'?'task':group==='订单'?'order':group==='积分与签到'?'coins':'heart'} tone='primary'/><Text className='section-title'>{group}</Text><Text className='muted'>{members.length} 项</Text><View className={open?'chevron-expanded':''}><Icon name='chevron' size={16} tone='muted'/></View></Button>{open&&<><View className='menu'>{visible.map(t=><Button key={t.code} className='template-row menu-item' onClick={()=>void navigate(`/packages/account/notification-template/index?code=${t.code}`)}><Text className='template-name'>{t.name}</Text><Text className='channel-label'>{channelNames[t.channel]}</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}</View>{group==='任务'&&members.length>visible.length&&<Button className='text-button' onClick={()=>setAllTasks(true)}>查看全部 {members.length} 项 <Icon name='chevron' size={15} tone='primary'/></Button>}</>}</View>
    })}
    <InlineInfo>默认仅站内。修改只影响之后发生的事情，不改写、删除或补发历史消息；关闭提醒也不隐藏首页待办。</InlineInfo>
  </Page>
}
