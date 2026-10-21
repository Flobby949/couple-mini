import { describe, expect, it } from 'vitest'
import { beijingTime, parsePoints } from '../src/core/values'

describe('points use decimal text and reject negative values before rounding', () => {
  it.each([['0', 0], ['0.49', 0], ['0.5', 1], ['21.5', 22], ['999999999.5', 1_000_000_000]])('%s -> %s', (raw, value) => expect(parsePoints(raw)).toBe(value))
  it.each(['', ' ', '-0.1', '-1', 'NaN', '1e3', '01', '1000000000.5', '1.1234567', '99999999999999999'])('rejects %s', raw => expect(parsePoints(raw)).toBeNull())
})
it('uses Beijing date independently of host timezone', () => {
  expect(beijingTime('2026-10-20T16:00:00Z')).toBe('2026-10-21 00:00')
  expect(beijingTime('2026-10-21T00:00:00+08:00')).toBe('2026-10-21 00:00')
})
