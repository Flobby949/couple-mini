import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { CheckinCalendar } from '../src/contracts/checkin'
import type { Context } from '../src/contracts/api'

const state = vi.hoisted(() => ({
  hide: vi.fn(), show: vi.fn(), invalidate: vi.fn(),
  allowed: true, context: undefined as unknown, lastQuery: undefined as unknown,
  months: {} as Record<string, unknown>,
}))
vi.mock('@tarojs/taro', () => ({ default: { pxTransform: (value: number) => `${value}px` } }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image', ScrollView: 'scroll-view' }))
vi.mock('../src/app/theme', () => ({ useTheme: () => ({ scheme: 'light', appearance: { accent: 'iris' } }) }))
vi.mock('../src/platform/tab-bar', () => ({ hideTabBar: state.hide, showTabBar: state.show }))
vi.mock('../src/features/checkin/use-checkin-day', () => ({ useCheckinDay: () => {} }))
vi.mock('../src/features/checkin/api', () => ({ getCheckinCalendar: vi.fn() }))
vi.mock('../src/features/checkin/mood-image', () => ({ MoodImage: ({ mood, size }: { mood: string; size: number }) => <span data-mood={mood} data-size={size}/> }))
vi.mock('../src/ui/visual', () => ({ Avatar: ({ user, checked }: { user: { id: string }; checked?: boolean }) => <span data-avatar={user.id} data-checked={checked}/>, Icon: ({ name }: { name: string }) => <span data-icon={name}/> }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../src/app/hooks', () => ({ useGate: () => ({ data: state.context, allowed: state.allowed, visible: state.allowed, canShow: true, error: null, refetch: vi.fn() }) }))
vi.mock('../src/core/query', () => ({ keys: { checkinMonth: (actor: string, couple: string, month: string) => ['checkins', 'month', actor, couple, month] }, queries: { invalidateQueries: state.invalidate } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: { queryKey: string[] }) => { state.lastQuery = options; return { data: state.months[options.queryKey[4]], error: null, refetch: vi.fn() } } }))

import { MoodPicker } from '../src/features/checkin/mood-picker'
import { CheckinPortrait } from '../src/features/checkin/checkin-portrait'
import CheckinCalendarPage from '../src/packages/account/checkin-calendar'
let tree: ReactTestRenderer | undefined
const context: Context = { me: { id: 'alice', nickname: 'Flobby' }, partner: { id: 'bob', nickname: 'Flora' }, couple: { id: 'couple', dailyLimit: 100, doubleDays: 1, checkinRevision: 2 }, stage: 'ready', businessDate: '2026-10-22', serverTime: '2026-10-22T01:00:00Z' }
beforeEach(() => {
  vi.clearAllMocks(); state.hide.mockResolvedValue(undefined); state.show.mockResolvedValue(undefined)
  state.allowed = true; state.context = structuredClone(context)
  const make = (month: string, count: number): CheckinCalendar => ({ month, firstMonth: '2026-09', businessDate: context.businessDate, serverTime: context.serverTime, revision: 2, days: Array.from({ length: count }, (_, index) => ({ date: `${month}-${String(index + 1).padStart(2, '0')}`, me: null, partner: null })) })
  const october = make('2026-10', 31)
  october.days[21] = { date: '2026-10-22', me: { mood: 'happy', checkedAt: '2026-10-22T01:00:00Z' }, partner: { mood: 'energetic', checkedAt: '2026-10-22T00:00:00Z' } }
  october.days[0].me = { mood: null, checkedAt: '2026-10-01T01:00:00Z' }
  state.months = { '2026-10': october, '2026-09': make('2026-09', 30) }
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined })

it('requires a choice before confirming the exact selected mood and restores the tab bar on close', () => {
  const confirm = vi.fn(), close = vi.fn()
  act(() => { tree = create(<MoodPicker busy={false} error={null} close={close} confirm={confirm}/>) })
  expect(state.hide).toHaveBeenCalledOnce()
  expect(tree!.root.findByProps({ className: 'button mood-confirm' }).props.disabled).toBe(true)
  expect(tree!.root.findAll(node => node.type === 'button' && node.props.className?.startsWith('mood-option '))).toHaveLength(8)
  act(() => tree!.root.findByProps({ ariaLabel: '想你' }).props.onClick())
  const button = tree!.root.findByProps({ className: 'button mood-confirm' })
  expect(button.props.disabled).toBe(false)
  act(() => button.props.onClick()); expect(confirm).toHaveBeenCalledWith('missing')
  act(() => tree!.unmount()); tree = undefined
  expect(state.show).toHaveBeenCalledOnce()
})
it('keeps the submitting choice locked and does not dismiss through the backdrop', () => {
  const close = vi.fn()
  act(() => { tree = create(<MoodPicker busy error={null} close={close} confirm={vi.fn()}/>) })
  act(() => tree!.root.findByProps({ className: 'sheet-backdrop mood-backdrop' }).props.onClick())
  expect(close).not.toHaveBeenCalled()
  expect(tree!.root.findByProps({ ariaLabel: '关闭心情选择' }).props.disabled).toBe(true)
  expect(tree!.root.findByProps({ ariaLabel: '开心' }).props.disabled).toBe(true)
})
it('freezes an unresolved original choice but lets the user leave the sheet to recover it', () => {
  const close = vi.fn()
  act(() => { tree = create(<MoodPicker busy blocked error={new Error('网络中断，请核查原操作')} close={close} confirm={vi.fn()}/>) })
  expect(tree!.root.findByProps({ className: 'button mood-confirm' }).props.disabled).toBe(true)
  expect(tree!.root.findByProps({ ariaLabel: '想你' }).props.disabled).toBe(true)
  expect(tree!.root.findByProps({ ariaLabel: '关闭心情选择' }).props.disabled).toBe(false)
  act(() => tree!.root.findByProps({ className: 'sheet-backdrop mood-backdrop' }).props.onClick())
  expect(close).toHaveBeenCalledOnce()
})
it('only replaces the signed-in person’s avatar; legacy sign-ins retain their honest checked state', () => {
  const user = { id: 'alice', nickname: 'Flobby' }
  act(() => { tree = create(<CheckinPortrait user={user} partnerId='bob' checked={false}/>) })
  expect(tree!.root.findByProps({ 'data-avatar': 'alice' }).props['data-checked']).toBe(false)
  act(() => tree!.update(<CheckinPortrait user={user} partnerId='bob' checked entry={{ mood: 'happy', checkedAt: context.serverTime }}/>))
  expect(tree!.root.findAllByProps({ 'data-avatar': 'alice' })).toHaveLength(0)
  expect(tree!.root.findByProps({ 'data-mood': 'happy' }).props['data-size']).toBeLessThan(112)
  expect(tree!.root.findByProps({ className: 'portrait-frame' }).props.src).toContain('avatar-stitch-frame.png')
  act(() => tree!.update(<CheckinPortrait user={user} partnerId='bob' checked entry={{ mood: null, checkedAt: context.serverTime }}/>))
  expect(tree!.root.findByProps({ 'data-avatar': 'alice' }).props['data-checked']).toBe(true)
})
it('shows both moods in ordered slots, leaves future days empty and keeps selected-day details', () => {
  act(() => { tree = create(<CheckinCalendarPage/>) })
  const today = tree!.root.findByProps({ ariaLabel: '10月22日 · 星期四，今天，已选中' })
  expect(today.findAll(node => !!node.props['data-mood']).map(node => node.props['data-mood'])).toEqual(['happy', 'energetic'])
  const future = tree!.root.findByProps({ ariaLabel: '10月23日 · 星期五' })
  expect(future.props.disabled).toBe(true); expect(future.findAllByProps({ className: 'calendar-missing' })).toHaveLength(0)
  act(() => tree!.root.findByProps({ ariaLabel: '10月1日 · 星期四' }).props.onClick())
  expect(tree!.root.findAllByProps({ className: 'calendar-detail-label' }).map(node => node.children.join(''))).toEqual(['未记录心情', '未签到'])
})
it('loads whole months with viewer-specific keys and pauses queries on hidden pages', () => {
  act(() => { tree = create(<CheckinCalendarPage/>) })
  expect(state.lastQuery).toMatchObject({ queryKey: ['checkins', 'month', 'alice', 'couple', '2026-10'], enabled: true, staleTime: 30000 })
  act(() => tree!.root.findByProps({ ariaLabel: '上个月' }).props.onClick())
  expect(state.lastQuery).toMatchObject({ queryKey: ['checkins', 'month', 'alice', 'couple', '2026-09'], staleTime: Infinity })
  expect(tree!.root.findByProps({ ariaLabel: '上个月' }).props.disabled).toBe(true)
  state.allowed = false; act(() => tree!.update(<CheckinCalendarPage/>))
  expect(state.lastQuery).toMatchObject({ enabled: false })
  expect(tree!.root.findAllByProps({ className: 'calendar-grid' })).toHaveLength(1)
})
it('refreshes this relationship’s current month when the polled revision changes', () => {
  act(() => { tree = create(<CheckinCalendarPage/>) })
  state.context = { ...context, couple: { ...context.couple!, checkinRevision: 3 } }
  act(() => tree!.update(<CheckinCalendarPage/>))
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['checkins', 'month', 'alice', 'couple', '2026-10'], exact: true })
})
