import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Preference } from '../../contracts/notifications'
import { session } from '../../core/api'
import { keys } from '../../core/query'
import { useAction } from '../../core/use-action'
import { rememberedSubscriptions, subscriptionSupported } from '../../platform/subscription'
import { getPreferences } from './api'
import { subscriptionGroups } from './subscriptions'
import { useSubscriptions } from './use-subscriptions'

const emptyItems: Preference[] = []
export function useReminderAction(enabled: boolean) {
  const action = useAction(), actor = session()?.user.id || '', lock = useRef(false)
  const query = useQuery({queryKey: keys.preferences,queryFn: getPreferences,enabled: enabled && subscriptionSupported,staleTime: 0})
  const items = query.data?.items || emptyItems, subscriptions = useSubscriptions(items,enabled)
  const [remembered,setRemembered] = useState<{actor: string; ids: string[]}>({actor,ids: []})
  useEffect(() => {
    let active = true
    setRemembered({actor,ids: []})
    if (enabled && subscriptionSupported) void rememberedSubscriptions().then(ids => {
      if (active && session()?.user.id === actor) setRemembered({actor,ids})
    })
    return () => { active = false }
  },[enabled,actor,items])
  const groups = subscriptionGroups(items).filter(group => remembered.actor === actor && remembered.ids.includes(group.id)).slice(0,3)
  async function run<T>(fn: () => Promise<T>, done?: (result: T) => void | Promise<void>) {
    if (lock.current || action.busy) return
    lock.current = true
    try { await subscriptions.withAction(groups,() => action.run(fn,done)) }
    finally { lock.current = false }
  }
  return {busy: action.busy || subscriptions.busy,error: action.error || (subscriptions.error ? new Error(`微信提醒补充未完成：${subscriptions.error.message}。业务结果以当前状态为准。`) : null),run}
}
