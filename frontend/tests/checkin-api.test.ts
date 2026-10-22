import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CheckinResult, Context, Home } from '../src/contracts/api'
import type { CheckinCalendar } from '../src/contracts/checkin'

const network = vi.hoisted(() => ({ mutate: vi.fn(), request: vi.fn(), actor: 'alice' }))
vi.mock('../src/core/operations', () => ({ mutate: network.mutate }))
vi.mock('../src/core/api', () => ({ request: network.request, session: () => ({ user: { id: network.actor } }), ApiError: class extends Error {} }))
import { checkIn, getCheckinCalendar } from '../src/features/checkin/api'
import { keys, queries } from '../src/core/query'

const context: Context = { me: { id: 'alice', nickname: '我' }, partner: { id: 'bob', nickname: 'TA' }, couple: { id: 'couple', dailyLimit: 100, doubleDays: 0, checkinRevision: 4 }, stage: 'ready', serverTime: '2026-10-22T01:00:00Z', businessDate: '2026-10-22' }
const receipt: CheckinResult = { date: '2026-10-22', mood: 'happy', checkedAt: '2026-10-22T01:00:00Z', revision: 5, base: 10, doubleBonus: 10, milestoneBonus: 0, total: 20, doubleDays: 1 }
const home: Home = { context, checkin: { me: false, partner: true, meEntry: null, partnerEntry: { mood: 'energetic', checkedAt: '2026-10-22T00:59:00Z' }, revision: 4 }, points: { balance: 0, earned: 0, dailyLimit: 100, remaining: 100, total: 110, available: 110, reserved: 0 }, milestones: [], todos: [], taskTodos: [], orderTodos: [] }
const calendar: CheckinCalendar = { month: '2026-10', firstMonth: '2026-10', businessDate: context.businessDate, serverTime: context.serverTime, revision: 4, days: [{ date: '2026-10-22', me: null, partner: home.checkin.partnerEntry! }] }
beforeEach(() => {
  vi.clearAllMocks(); queries.clear(); network.actor = 'alice'
  queries.setQueryData(keys.context, structuredClone(context)); queries.setQueryData(keys.home, structuredClone(home))
  queries.setQueryData(keys.checkinMonth('alice', 'couple', '2026-10'), structuredClone(calendar))
  network.mutate.mockResolvedValue(structuredClone(receipt))
})
afterEach(() => queries.clear())
it('submits the selected mood and observed business date, then publishes only confirmed facts', async () => {
  await checkIn('happy', '2026-10-22')
  expect(network.mutate).toHaveBeenCalledWith('/checkins', { mood: 'happy', expectedDate: '2026-10-22' })
  const result = queries.getQueryData<Home>(keys.home)!
  expect(result.checkin.meEntry?.mood).toBe('happy'); expect(result.checkin.partnerEntry?.mood).toBe('energetic')
  expect(result.points).toEqual(home.points)
  const month = queries.getQueryData<CheckinCalendar>(keys.checkinMonth('alice', 'couple', '2026-10'))!
  expect(month.days[0].me?.mood).toBe('happy'); expect(month.revision).toBe(5)
})
it('does not claim success or overwrite the mood after a rejected or unknown request', async () => {
  network.mutate.mockRejectedValue(new Error('timeout'))
  await expect(checkIn('sad', context.businessDate)).rejects.toThrow('timeout')
  expect(queries.getQueryData<Home>(keys.home)?.checkin.me).toBe(false)
})
it('keeps an old-day receipt from changing the currently displayed day', async () => {
  queries.setQueryData(keys.context, { ...context, businessDate: '2026-10-23' })
  await checkIn('happy', '2026-10-22')
  expect(queries.getQueryData<Home>(keys.home)?.checkin.me).toBe(false)
  expect(queries.getQueryData<CheckinCalendar>(keys.checkinMonth('alice', 'couple', '2026-10'))?.days[0].me?.mood).toBe('happy')
})
it('does not apply a late response after an account switch or over newer data', async () => {
  network.mutate.mockImplementationOnce(async () => { network.actor = 'bob'; return receipt })
  await checkIn('happy', '2026-10-22')
  expect(queries.getQueryData<Home>(keys.home)?.checkin.me).toBe(false)
  network.actor = 'alice'
  queries.setQueryData(keys.home, { ...home, checkin: { ...home.checkin, revision: 6, me: true, meEntry: { mood: 'calm', checkedAt: receipt.checkedAt } } })
  await checkIn('happy', '2026-10-22')
  expect(queries.getQueryData<Home>(keys.home)?.checkin.meEntry?.mood).toBe('calm')
})
it('fetches a single account-scoped month response rather than a request per date', async () => {
  await getCheckinCalendar('2026-10')
  expect(network.request).toHaveBeenCalledOnce()
  expect(network.request).toHaveBeenCalledWith('/checkins/calendar?month=2026-10')
  expect(keys.checkinMonth('alice', 'couple', '2026-10')).not.toEqual(keys.checkinMonth('bob', 'couple', '2026-10'))
})
