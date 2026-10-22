import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../src/core/api', () => ({ request: state.request, ApiError: Error }))
vi.mock('../src/core/operations', () => ({ mutate: vi.fn() }))
import { getOrderCounts } from '../src/features/orders/api'

beforeEach(() => vi.clearAllMocks())
it('counts all unfinished pages separately by role and status without counting history', async () => {
  state.request.mockImplementation(async (path: string) => {
    const url = new URL(path, 'https://example.test')
    const role = url.searchParams.get('role'), status = url.searchParams.get('status')
    expect(['pending', 'fulfilling', 'awaiting_receipt']).toContain(status)
    if (role === 'buyer' && status === 'pending') return url.searchParams.get('cursor') ? { items: [{}], nextCursor: '' } : { items: Array(50).fill({}), nextCursor: 'next+page' }
    const count = role === 'buyer' ? status === 'fulfilling' ? 2 : 1 : status === 'pending' ? 0 : status === 'fulfilling' ? 1 : 3
    return { items: Array(count).fill({ cancelPending: true }), nextCursor: '' }
  })
  expect(await getOrderCounts()).toEqual({ buyer: { pending: 51, fulfilling: 2, awaiting_receipt: 1 }, seller: { pending: 0, fulfilling: 1, awaiting_receipt: 3 } })
  expect(state.request).toHaveBeenCalledTimes(7)
  expect(state.request).toHaveBeenCalledWith('/orders?role=buyer&status=pending&cursor=next%2Bpage')
})

it('does not publish partial counts if a subsequent page fails', async () => {
  state.request.mockImplementation(async (path: string) => {
    const url = new URL(path, 'https://example.test')
    if (url.searchParams.get('cursor')) throw new Error('读取失败')
    return { items: [], nextCursor: url.searchParams.get('role') === 'buyer' && url.searchParams.get('status') === 'pending' ? 'next' : '' }
  })
  await expect(getOrderCounts()).rejects.toThrow('读取失败')
})
