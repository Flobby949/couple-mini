import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Taro from '@tarojs/taro'
import { Button, Text } from '@tarojs/components'
import type { Preference } from '../../contracts/notifications'
import { keys } from '../../core/query'
import { pending } from '../../core/operations'
import { navigate } from '../../platform'
import { subscriptionSupported } from '../../platform/subscription'
import { getPreferences } from './api'
import { subscriptionGroups } from './subscriptions'
import { useSubscriptions } from './use-subscriptions'

const emptyItems: Preference[] = []
export function SubscriptionEntry({enabled}: {enabled: boolean}) {
  const query = useQuery({queryKey: keys.preferences,queryFn: getPreferences,enabled,staleTime: 0})
  const subscriptions = useSubscriptions(query.data?.items || emptyItems,enabled), shown = useRef('')
  const groups = subscriptionGroups(query.data?.items || emptyItems).slice(0,3)
  useEffect(() => {
    if (subscriptions.busy) {shown.current=''; return}
    if (!enabled) return
    const title = subscriptions.error ? '补充未完成，请到通知设置重试' : subscriptions.status.includes('未获得') ? '本次未增加订阅次数' : subscriptions.status.includes('已同步') ? '订阅结果已同步' : subscriptions.status ? subscriptions.status.slice(0,35) : ''
    if (title && shown.current !== title) {shown.current=title; void Taro.showToast({title,icon:'none'}).catch(() => {})}
  },[enabled,subscriptions.busy,subscriptions.error,subscriptions.status])
  function replenish() {
    if (subscriptions.staleReports.length || query.error || !groups.length) {void navigate('/packages/account/notification-settings/index'); return}
    if (!subscriptionSupported) {void Taro.showToast({title:'请在微信小程序中补充提醒',icon:'none'}).catch(() => {}); return}
    if (subscriptions.reports.length) void subscriptions.sync()
    else void subscriptions.subscribe(groups)
  }
  if (!enabled) return null
  return <Button className='header-subscription' ariaLabel={subscriptions.reports.length ? '同步微信订阅结果' : '补充微信提醒次数'} disabled={subscriptions.busy || !!pending() || !query.data && !query.error} onClick={replenish}><Text className='header-subscription-label'>{subscriptions.busy ? '补充中' : subscriptions.reports.length ? '同步' : '补充'}</Text></Button>
}
