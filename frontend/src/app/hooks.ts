import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDidHide, useDidShow, useRouter } from '@tarojs/taro'
import { redirect } from '../platform'
import { session } from '../core/api'
import { keys } from '../core/query'
import { getContext } from '../features/identity/api'
import { rememberTarget, routeContext } from './navigation'

export { routeContext } from './navigation'

export function useVisible() {
  const [visible, set] = useState(false)
  useDidShow(() => set(true)); useDidHide(() => set(false))
  return visible
}
export function useGate(minimum: 'bound' | 'ready' = 'ready') {
  const visible = useVisible()
  const router = useRouter()
  const query = useQuery({ queryKey: keys.context, queryFn: getContext, enabled: visible && !!session(), refetchInterval: visible ? 15000 : false })
  useEffect(() => {
    if (!visible) return
    if (!session()) { rememberTarget(router.path, router.params.id, router.params.code); void redirect('/pages/entry/index'); return }
    if (query.data?.stage === 'binding' || minimum === 'ready' && query.data?.stage === 'rules') {
      rememberTarget(router.path, router.params.id, router.params.code)
      void routeContext(query.data)
    }
  }, [visible, query.data?.stage, minimum])
  return { ...query, visible, allowed: visible && !!query.data && (minimum === 'bound' ? query.data.stage !== 'binding' : query.data.stage === 'ready') }
}
