import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getPreferences } from '../../../features/notifications/api'
import { channelNames } from '../../../features/notifications/presentation'
import { keys } from '../../../core/query'
import { navigate } from '../../../platform'
import { ErrorState, Loading } from '../../../ui'

export default function NotificationSettingsPage() {
  const gate = useGate()
  const query = useQuery({ queryKey: keys.preferences, queryFn: getPreferences, enabled: gate.allowed, staleTime: 0 })
  const items = query.data?.items || []
  return <Page title='让提醒，按你的方式来' subtitle='30 种消息分别设置，只管理你自己的接收方式。'>
    <Text className='muted'>默认仅站内。修改只影响之后发生的事情，不改写、删除或补发历史消息；关闭提醒也不隐藏首页待办。</Text>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!query.data && !query.error && <Loading />}
    {gate.allowed && ['订单','任务','积分与签到','绑定与规则'].map(group => <View key={group}><Text className='section-title section-heading'>{group} · {items.filter(t => t.group === group).length} 项</Text><View className='surface menu'>{items.filter(t => t.group === group).map(t => <Button key={t.code} className='template-row menu-item' onClick={() => void navigate(`/packages/account/notification-template/index?code=${t.code}`)}><View><Text>{t.code} · {t.name}</Text><Text className='muted'>{channelNames[t.channel]}</Text></View><Text>›</Text></Button>)}</View></View>)}
    <Button className='text-button' onClick={() => void navigate('/packages/account/messages/index')}>返回消息中心</Button>
  </Page>
}
