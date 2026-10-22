import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Home } from '../src/contracts/api'
import type { Task } from '../src/contracts/tasks'

const state = vi.hoisted(() => ({
  gate: { visible: true, allowed: true, canShow: true },
  home: vi.fn(), tasks: vi.fn(), openTasks: vi.fn(), setBadge: vi.fn().mockResolvedValue({}), removeBadge: vi.fn().mockResolvedValue({}),
}))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image' }))
vi.mock('@tarojs/taro', () => ({ default: { setTabBarBadge: state.setBadge, removeTabBarBadge: state.removeBadge } }))
vi.mock('../src/app/hooks', () => ({ useGate: () => state.gate }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/features/home/api', () => ({ getHome: state.home }))
vi.mock('../src/features/tasks/api', () => ({ getTasks: state.tasks, getOpenTasks: state.openTasks }))
vi.mock('../src/platform', () => ({ navigate: vi.fn() }))
vi.mock('../src/ui', () => ({ Empty: () => null, ErrorState: () => null, Loading: () => null }))
vi.mock('../src/ui/visual', () => ({ Icon: () => null }))
vi.mock('../src/ui/use-artwork', () => ({ useArtwork: () => ({}) }))

import Tasks from '../src/pages/tasks'
import { TaskTabBadge } from '../src/features/tasks/tab-badge'

let tree: ReactTestRenderer | undefined
let client: QueryClient
const task = (id: string, kind: Task['kind'], status: Task['status'], allowedActions: Task['allowedActions']): Task => ({ id, kind, status, allowedActions, name: id, reward: 0, cancelRequest: null } as Task)
const todos = (joint: number, partner: number) => [...Array.from({ length: joint }, (_, i) => task(`joint-${i}`, 'joint', 'active', ['submit'])), ...Array.from({ length: partner }, (_, i) => task(`partner-${i}`, 'partner', 'active', ['submit']))]
const home = (taskTodos: Task[]) => ({ taskTodos, points: { available: 0, reserved: 0 } } as Home)
const openKey = ['tasks', 'open']
const button = (label: string) => tree!.root.findByProps({ ariaLabel: label })
async function render(children: React.ReactNode) {
  await act(async () => { tree = create(<QueryClientProvider client={client}>{children}</QueryClientProvider>); await new Promise(resolve => setTimeout(resolve, 10)) })
}
beforeEach(() => {
  vi.clearAllMocks()
  state.gate = { visible: true, allowed: true, canShow: true }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  state.home.mockResolvedValue(home(todos(2, 1)))
  state.openTasks.mockResolvedValue(todos(2, 1))
  state.tasks.mockResolvedValue({ items: [], nextCursor: '' })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; client.clear() })

it('shows per-kind and active counts while keeping the todo filter unnumbered', async () => {
  client.setQueryData(openKey, todos(2, 1))
  await render(<Tasks/>)
  expect(tree!.root.findAllByProps({ className: 'task-count-badge' }).map(node => node.children.join(''))).toEqual(['2', '1', '2'])
  expect(button('待我处理').findAllByProps({ className: 'task-count-badge' })).toHaveLength(0)
  act(() => tree!.root.findByProps({ ariaLabel: '伴侣任务，1 个未结束任务' }).props.onClick())
  expect(tree!.root.findAllByProps({ className: 'task-count-badge' }).map(node => node.children.join(''))).toEqual(['2', '1', '1'])
})

it('hides zero counts and caps page badges at 99+', async () => {
  client.setQueryData(openKey, todos(0, 101))
  await render(<Tasks/>)
  expect(tree!.root.findAllByProps({ className: 'task-count-badge' }).map(node => node.children.join(''))).toEqual(['99+'])
})

it('updates the bottom tab total after a task mutation invalidates task data, then clears it at zero', async () => {
  await render(<TaskTabBadge/>)
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 1, text: '3' })
  state.openTasks.mockResolvedValue(todos(1, 0))
  await act(async () => { await client.invalidateQueries({ queryKey: openKey }); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 1, text: '1' })
  state.openTasks.mockResolvedValue([])
  await act(async () => { await client.invalidateQueries({ queryKey: openKey }); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(state.removeBadge).toHaveBeenLastCalledWith({ index: 1 })
})

it('caps the bottom tab at 99+ and prevents hidden pages from overwriting it', async () => {
  client.setQueryData(openKey, todos(80, 21))
  await render(<TaskTabBadge/>)
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 1, text: '99+' })
  state.gate = { visible: false, allowed: false, canShow: true }
  state.setBadge.mockClear(); state.removeBadge.mockClear()
  act(() => tree!.update(<QueryClientProvider client={client}><TaskTabBadge/></QueryClientProvider>))
  act(() => { client.setQueryData(openKey, []) })
  expect(state.setBadge).not.toHaveBeenCalled()
  expect(state.removeBadge).not.toHaveBeenCalled()
  state.gate = { visible: true, allowed: true, canShow: true }
  await act(async () => { tree!.update(<QueryClientProvider client={client}><TaskTabBadge/></QueryClientProvider>); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(state.removeBadge).toHaveBeenLastCalledWith({ index: 1 })
})

it('does not fetch tasks before the gate allows access and clears any previous badge', async () => {
  state.gate = { visible: true, allowed: false, canShow: false }
  await render(<TaskTabBadge/>)
  expect(state.openTasks).not.toHaveBeenCalled()
  expect(state.removeBadge).toHaveBeenCalledWith({ index: 1 })
})

it.each([
  { actions: ['edit', 'request_cancel'], copy: '等待伴侣接受' },
  { actions: ['accept', 'reject_accept', 'request_cancel'], copy: '待你接受' },
])('shows pending tasks to both sides: $copy', async ({ actions, copy }) => {
  const pending = task('等待接受的共同任务', 'joint', 'pending', actions as Task['allowedActions'])
  client.setQueryData(openKey, [pending, task('已经接受的共同任务', 'joint', 'active', ['submit']), task('已经提交的共同任务', 'joint', 'awaiting', ['request_cancel'])])
  await render(<Tasks/>)
  expect(button('进行中，2 个任务')).toBeDefined()
  act(() => button('待接受，1 个任务').props.onClick())
  expect(JSON.stringify(tree!.toJSON())).toContain(pending.name)
  expect(JSON.stringify(tree!.toJSON())).toContain(copy)
  expect(JSON.stringify(tree!.toJSON())).not.toContain('已经接受的共同任务')
  const accepted = { ...pending, status: 'active' as const, allowedActions: ['submit'] as Task['allowedActions'] }
  await act(async () => { client.setQueryData(openKey, [accepted]); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(button('待接受，0 个任务').findAllByProps({ className: 'task-count-badge' })).toHaveLength(0)
  expect(button('进行中，1 个任务')).toBeDefined()
  act(() => button('进行中，1 个任务').props.onClick())
  expect(JSON.stringify(tree!.toJSON())).toContain(pending.name)
})

it('counts pending tasks for the creator and counts recipient pending tasks only once in the bottom tab', async () => {
  client.setQueryData(openKey, [task('sent', 'joint', 'pending', ['edit']), task('received', 'partner', 'pending', ['accept']), task('waiting-confirm', 'joint', 'awaiting', ['request_cancel'])])
  await render(<TaskTabBadge/>)
  expect(state.setBadge).toHaveBeenLastCalledWith({ index: 1, text: '2' })
})
