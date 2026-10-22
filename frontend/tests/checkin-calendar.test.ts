import { expect, it } from 'vitest'
import { calendarCells, dayLabel, monthLabel, shiftMonth, untilNextDay } from '../src/features/checkin/calendar'
import { moods } from '../src/features/checkin/moods'
import manifest from '../src/features/checkin/mood-asset-manifest.json'

it('places October 2026 on Thursday in a Monday-first calendar with no invented dates', () => {
  const cells = calendarCells('2026-10')
  expect(cells).toHaveLength(35)
  expect(cells.slice(0, 7)).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  expect(cells[24]).toBe('2026-10-22')
  expect(cells.filter(Boolean)).toHaveLength(31)
  expect(cells.at(-1)).toBeNull()
  expect(dayLabel('2026-10-22')).toBe('10月22日 · 星期四')
})
it('handles leap days, six-week months and year boundaries without device timezone parsing', () => {
  expect(calendarCells('2028-02').filter(Boolean)).toHaveLength(29)
  expect(calendarCells('2026-02').filter(Boolean)).toHaveLength(28)
  expect(calendarCells('2026-03')).toHaveLength(42)
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  expect(monthLabel('2026-01')).toBe('2026年1月')
  for (const bad of ['2026-1', '2026-13', '2026-00', 'today']) expect(() => calendarCells(bad)).toThrow()
})
it('refreshes at the Beijing day boundary using server time, not the device local date', () => {
  expect(untilNextDay('2026-10-22T15:59:59Z', '2026-10-22')).toBe(1100)
  expect(untilNextDay('2026-10-22T16:00:01Z', '2026-10-22')).toBe(100)
})
it('has exactly one light and dark asset for every preset mood', () => {
  expect(moods.map(mood => mood.id)).toEqual(Object.keys(manifest.files))
  expect(new Set(moods.map(mood => mood.id)).size).toBe(8)
  for (const mood of moods) for (const scheme of ['light', 'dark'] as const) expect(manifest.files[mood.id][scheme].path).toBe(`${scheme}/${mood.id}.png`)
})
