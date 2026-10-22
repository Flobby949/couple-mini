import { beforeEach, expect, it, vi } from 'vitest'
import type { Task } from '../src/contracts/tasks'

const state = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../src/core/api', () => ({ request: state.request, ApiError: Error }))
vi.mock('../src/core/operations', () => ({ mutate: vi.fn() }))
import { getOpenTasks } from '../src/features/tasks/api'

beforeEach(() => vi.clearAllMocks())
it('loads every unfinished page for both task kinds so badges include tasks beyond the first page', async () => {
  const first = Array.from({ length: 50 }, (_, i) => ({ id: `joint-${i}`, kind: 'joint', status: 'active' } as Task))
  const pending = { id: 'late-pending', kind: 'joint', status: 'pending' } as Task
  const partner = { id: 'partner-pending', kind: 'partner', status: 'pending' } as Task
  state.request.mockImplementation(async (path: string) => {
    const url = new URL(path, 'https://example.test')
    expect(url.searchParams.get('filter')).toBe('active')
    if (url.searchParams.get('kind') === 'partner') return { items: [partner], nextCursor: '' }
    return url.searchParams.get('cursor') ? { items: [pending], nextCursor: '' } : { items: first, nextCursor: 'next+page' }
  })
  const tasks = await getOpenTasks()
  expect(tasks).toHaveLength(52)
  expect(tasks).toContainEqual(pending)
  expect(tasks).toContainEqual(partner)
  expect(state.request).toHaveBeenCalledWith('/tasks?kind=joint&filter=active&cursor=next%2Bpage')
})

it('rejects an incomplete overview when any subsequent page fails', async () => {
  state.request.mockImplementation(async (path: string) => {
    const url = new URL(path, 'https://example.test')
    if (url.searchParams.get('cursor')) throw new Error('读取失败')
    return { items: [], nextCursor: url.searchParams.get('kind') === 'joint' ? 'next' : '' }
  })
  await expect(getOpenTasks()).rejects.toThrow('读取失败')
})
