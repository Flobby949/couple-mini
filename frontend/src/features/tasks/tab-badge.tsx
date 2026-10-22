import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { setTabBadge } from '../../platform/tab-bar'
import { useGate } from '../../app/hooks'
import { keys } from '../../core/query'
import { getOpenTasks } from './api'
import { taskNeedsAction } from './presentation'

export function TaskTabBadge() {
  const gate = useGate()
  const query = useQuery({ queryKey: keys.openTasks, queryFn: getOpenTasks, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  const count = query.data?.filter(task => task.status === 'pending' || taskNeedsAction(task)).length
  useEffect(() => {
    if (!gate.visible) return
    if (!gate.allowed || count === 0) {
      void setTabBadge(1, 0).catch(() => {})
    } else if (count !== undefined) {
      void setTabBadge(1, count).catch(() => {})
    }
  }, [gate.visible, gate.allowed, count])
  return null
}
