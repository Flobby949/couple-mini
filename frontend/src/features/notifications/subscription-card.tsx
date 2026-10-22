import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import type { Preference } from '../../contracts/notifications'
import { keys } from '../../core/query'
import { pending } from '../../core/operations'
import { navigate } from '../../platform'
import { subscriptionSupported } from '../../platform/subscription'
import { ErrorState, Loading } from '../../ui'
import { Icon } from '../../ui/visual'
import { getPreferences } from './api'
import { lowSubscriptionCount, subscriptionGroups, subscriptionName } from './subscriptions'
import { useSubscriptions } from './use-subscriptions'

const emptyItems: Preference[] = []
export function SubscriptionCard({enabled,group,disabled=false}: {enabled: boolean; group?: '任务' | '订单'; disabled?: boolean}) {
  const query = useQuery({queryKey: keys.preferences,queryFn: getPreferences,enabled,staleTime: 0})
  const items = query.data?.items || emptyItems, subscriptions = useSubscriptions(items,enabled)
  const groups = subscriptionGroups(items,group), [chosen,setChosen] = useState<string[]>(), [expanded,setExpanded] = useState(false)
  const selected = chosen ? groups.filter(item => chosen.includes(item.id)).slice(0,3) : groups.slice(0,3)
  const low = groups.filter(item => item.remaining <= lowSubscriptionCount).length
  const busy = subscriptions.busy || disabled || !!pending()
  function toggle(id: string) {
    const ids = selected.map(item => item.id)
    setChosen(ids.includes(id) ? ids.filter(value => value !== id) : ids.length < 3 ? [...ids,id] : ids)
  }
  if (!enabled) return null
  return <View className='surface subscription-card'>
    <View className='subscription-heading'><Icon name='bell' tone='primary' size={22}/><Text className='section-title'>{group ? `${group}后续微信提醒` : '补充微信提醒次数'}</Text></View>
    <ErrorState error={query.error} retry={() => void query.refetch()}/>
    {!query.data && !query.error && <Loading/>}
    {query.data && <>
      {!groups.length ? <Text className='muted'>还没有已开启的{group || ''}微信提醒，可在提醒设置中查看可用通知并选择接收方式。</Text> : <>
        <Text className='muted'>{low ? `${low} 种微信模板的预计剩余次数不超过 ${lowSubscriptionCount} 次，可以按需补充。` : '提醒次数充足，也可以按需补充。'}每次最多选择 3 种。</Text>
        <Button className='text-button subscription-select-toggle' onClick={() => setExpanded(!expanded)}>{expanded ? '收起提醒选择' : `选择要补充的提醒（${groups.length} 种）`}<Icon name='chevron' tone='primary' size={14}/></Button>
        <View className='subscription-options'>{expanded ? groups.map(item => <Button key={item.id} className={`subscription-option ${selected.some(value => value.id === item.id) ? 'is-selected' : ''}`} ariaLabel={`${item.items.map(t => t.name).join('、')}，预计剩余 ${item.remaining} 次${selected.some(value => value.id === item.id) ? '，已选中' : ''}`} disabled={busy || !selected.some(value => value.id === item.id) && selected.length >= 3} onClick={() => toggle(item.id)}><View className={`subscription-check ${selected.some(value => value.id === item.id) ? 'selected' : ''}`}>{selected.some(value => value.id === item.id) ? '✓' : ''}</View><Text className='subscription-name'>{subscriptionName(item)}</Text><Text className={`subscription-remaining ${item.remaining <= lowSubscriptionCount ? 'warning-text' : ''}`}>预计 {item.remaining} 次</Text></Button>) : selected.map(item => <View className='subscription-summary' key={item.id}><Text className='subscription-name'>{subscriptionName(item)}</Text><Text className={`subscription-remaining ${item.remaining <= lowSubscriptionCount ? 'warning-text' : ''}`}>预计 {item.remaining} 次</Text></View>)}</View>
        {!subscriptionSupported && <Text className='muted'>请在微信小程序中补充订阅次数。</Text>}
        <Button className='button secondary' loading={subscriptions.busy} disabled={busy || !!subscriptions.reports.length || !subscriptionSupported || !selected.length} onClick={() => void subscriptions.subscribe(selected)}>补充所选提醒（{selected.length}/3）</Button>
        <Text className='muted subscription-help'>每个同意的微信模板各增加 1 次，共用模板的通知共用次数。只补充自己的提醒，接收方式保持原设置。{group ? '订阅适用于这类通知，不仅限当前这一笔。' : ''}</Text>
      </>}
      <ErrorState error={subscriptions.error}/>
      {subscriptions.status && <View role='status'><Text className='muted'>{subscriptions.status}</Text></View>}
      {!!subscriptions.reports.length && <View className='form'><Text>有 {subscriptions.reports.length} 条订阅结果待同步，重试不会重复计次。</Text>{!!subscriptions.staleReports.length && <><Text className='muted'>其中 {subscriptions.staleReports.length} 条属于已调整的旧模板，无法用于当前提醒。清除旧结果后可按当前模板补充，旧次数不能转移。</Text><Button className='button secondary' disabled={busy} onClick={subscriptions.discardStale}>清除旧模板待同步结果</Button></>}<Button className='button secondary' disabled={busy || !!subscriptions.staleReports.length} onClick={() => void subscriptions.sync()}>同步订阅结果</Button></View>}
      {group ? <Button className='text-button' onClick={() => void navigate('/packages/account/notification-settings/index')}>设置微信接收方式</Button> : <Text className='muted'>在下方各类通知中设置接收方式。</Text>}
    </>}
  </View>
}
