import { expect, it } from 'vitest'
import { beijingDeadline, beijingTimeSeconds } from '../src/core/values'
import { reservationChange, taskStatus } from '../src/features/tasks/presentation'
import type { Task } from '../src/contracts/tasks'

it('constructs minute deadlines in Beijing independently of device timezone', () => {
  expect(beijingDeadline('2026-10-22','10:00')).toBe('2026-10-22T10:00:00+08:00')
  expect(beijingTimeSeconds('2026-10-21T16:00:00Z')).toBe('2026-10-22 00:00:00')
  for (const [date,time] of [['2026-02-29','10:00'],['2026-02-30','10:00'],['2026-10-22','24:00'],['','10:00'],['2026-10-22','']]) expect(beijingDeadline(date,time)).toBeNull()
})
it('edits reserve only the difference and never reserve the existing reward twice', () => {
  expect(reservationChange('joint',20,40,0)).toEqual({ total: 40, delta: 0, insufficient: false })
  expect(reservationChange('joint',10,40,0)).toEqual({ total: 20, delta: -20, insufficient: false })
  expect(reservationChange('joint',30,40,10)).toEqual({ total: 60, delta: 20, insufficient: true })
  expect(reservationChange('partner',0,0,0).insufficient).toBe(false)
})
it('task cancellation does not replace the current main stage or correction deadline', () => {
  const task = { status: 'active', cancelRequest: { id: 'pending' }, correctionDeadline: null } as Task
  expect(taskStatus(task)).toBe('进行中')
  expect(taskStatus({ ...task, status: 'awaiting' })).toBe('待确认完成')
  expect(taskStatus({ ...task, correctionDeadline: '2026-10-22T10:00:00+08:00' })).toBe('需要补正')
})
