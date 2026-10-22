import { mutate } from '../../core/operations'
import { request, session } from '../../core/api'
import { keys, queries } from '../../core/query'
import type { CheckinResult, Context, Home } from '../../contracts/api'
import type { CheckinCalendar, MoodId } from '../../contracts/checkin'

export const getCheckinCalendar = (month: string) => request<CheckinCalendar>(`/checkins/calendar?month=${encodeURIComponent(month)}`)
export async function checkIn(mood: MoodId, expectedDate: string) {
  const actor = session()?.user.id
  const couple = queries.getQueryData<Context>(keys.context)?.couple?.id
  const result = await mutate<CheckinResult>('/checkins', { mood, expectedDate })
  if (!actor || session()?.user.id !== actor || !couple) return result
  await queries.cancelQueries({ queryKey: keys.home })
  const entry = { mood: result.mood, checkedAt: result.checkedAt }
  queries.setQueryData<Home>(keys.home, current => {
    if (!current || queries.getQueryData<Context>(keys.context)?.businessDate !== result.date || current.context.me.id !== actor || current.context.couple?.id !== couple || current.context.businessDate !== result.date || (current.checkin.revision || 0) > result.revision) return current
    return { ...current, checkin: { ...current.checkin, me: true, meEntry: entry, revision: result.revision } }
  })
  const key = keys.checkinMonth(actor, couple, result.date.slice(0, 7))
  await queries.cancelQueries({ queryKey: key, exact: true })
  queries.setQueryData<CheckinCalendar>(key, current => current && current.revision <= result.revision
    ? { ...current, revision: result.revision, days: current.days.map(day => day.date === result.date ? { ...day, me: entry } : day) }
    : current)
  void queries.invalidateQueries({ queryKey: key, exact: true })
  return result
}
