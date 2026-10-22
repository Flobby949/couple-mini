import { useEffect } from 'react'
import type { Context } from '../../contracts/api'
import { keys, queries } from '../../core/query'
import { untilNextDay } from './calendar'

export function useCheckinDay(context: Context | undefined, visible: boolean) {
  useEffect(() => {
    if (!visible || !context) return
    const timer = setTimeout(() => {
      void queries.invalidateQueries({ queryKey: keys.context })
      void queries.invalidateQueries({ queryKey: keys.home })
    }, untilNextDay(context.serverTime, context.businessDate))
    return () => clearTimeout(timer)
  }, [visible, context?.serverTime, context?.businessDate])
}
