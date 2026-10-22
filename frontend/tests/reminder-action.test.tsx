import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { Preference } from '../src/contracts/notifications'

const state = vi.hoisted(() => ({
  actor: 'alice', supported: true, pending: false, serial: 0,
  items: [] as Preference[], stored: new Map<string,unknown>(),
  request: vi.fn(), remembered: vi.fn(), report: vi.fn(), refresh: vi.fn(), invalidate: vi.fn(),
}))
vi.mock('@tarojs/taro', () => ({useDidShow: () => {}}))
vi.mock('@tanstack/react-query', () => ({useQuery: () => ({data: {items: state.items}})}))
vi.mock('../src/core/api', () => ({session: () => ({user: {id: state.actor}})}))
vi.mock('../src/core/query', () => ({keys: {preferences: ['preferences']},refresh: state.refresh,queries: {invalidateQueries: state.invalidate}}))
vi.mock('../src/core/operations', () => ({pending: () => state.pending || undefined,newKey: () => `report_${++state.serial}`}))
vi.mock('../src/platform', () => ({storage: {
  read: (key: string) => state.stored.get(key),
  write: (key: string,value: unknown) => state.stored.set(key,value),
  remove: (key: string) => state.stored.delete(key),
}}))
vi.mock('../src/platform/subscription', () => ({get subscriptionSupported() {return state.supported},rememberedSubscriptions: state.remembered,requestSubscriptions: state.request}))
vi.mock('../src/features/notifications/api', () => ({getPreferences: vi.fn(),reportAuthorization: state.report}))
import { useReminderAction } from '../src/features/notifications/use-reminder-action'

let tree: ReactTestRenderer | undefined, controller: ReturnType<typeof useReminderAction>, secondary: ReturnType<typeof useReminderAction>
function Probe({enabled=true,index=0}: {enabled?: boolean; index?: number}) {const action=useReminderAction(enabled); if (index) secondary=action; else controller=action; return null}
const preference = (code: string,id: string,channel: Preference['channel']='both'): Preference => ({code,name:code,group:'任务',channel,wechatAvailable:true,platformTemplateId:id,authorization:'accept',authorizationAt:null,reportedRemaining:0})
async function render(enabled=true) {await act(async () => {tree=create(<Probe enabled={enabled}/>)})}
beforeEach(() => {
  vi.clearAllMocks(); state.actor='alice'; state.supported=true; state.pending=false; state.serial=0; state.stored.clear()
  state.items=[preference('T01','todo'),preference('T06','todo'),preference('O01','order'),preference('P01','points')]
  state.remembered.mockResolvedValue(['todo','order','points'])
  state.request.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map(id => [id,'accept'])))
  state.report.mockResolvedValue({}); state.refresh.mockResolvedValue(undefined); state.invalidate.mockResolvedValue(undefined)
})
afterEach(() => {act(() => tree?.unmount()); tree=undefined})

it('preloads remembered choices on foreground without requesting subscription until an action', async () => {
  await render()
  expect(state.remembered).toHaveBeenCalledTimes(1)
  expect(state.request).not.toHaveBeenCalled()
  act(() => tree!.update(<Probe enabled={false}/>))
  await act(async () => {tree!.update(<Probe/>)})
  expect(state.remembered).toHaveBeenCalledTimes(2)
  expect(state.request).not.toHaveBeenCalled()
})
it('only replenishes enabled available templates with remembered acceptance, deduplicated', async () => {
  state.remembered.mockResolvedValue(['todo','points','unavailable'])
  state.items[3]=preference('P01','points','in_app')
  state.items.push({...preference('T07','unavailable'),wechatAvailable:false})
  await render()
  const operation=vi.fn().mockResolvedValue('done'), done=vi.fn()
  await act(async () => {await controller.run(operation,done)})
  expect(state.request).toHaveBeenCalledExactlyOnceWith(['todo'])
  expect(operation).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledWith('done')
  expect(state.report).toHaveBeenCalledTimes(1)
})
it('picks up remembered consent granted by the manual subscription entry after preferences refresh', async () => {
  state.remembered.mockResolvedValue([])
  await render()
  state.remembered.mockResolvedValue(['todo'])
  state.items=state.items.map(item => ({...item,authorizationAt:'2026-10-22T07:00:00Z'}))
  await act(async () => {tree!.update(<Probe/>)})
  await act(async () => {await controller.run(async () => 'checked in')})
  expect(state.request).toHaveBeenCalledExactlyOnceWith(['todo'])
})
it('starts the native request in the click while allowing business to finish before authorization returns', async () => {
  let finish!: (value: Record<string,string>) => void
  state.request.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
  await render()
  const operation=vi.fn().mockResolvedValue('ordered'), done=vi.fn()
  let completion!: Promise<void>
  act(() => {completion=controller.run(operation,done)})
  expect(state.request).toHaveBeenCalledTimes(1)
  expect(operation).toHaveBeenCalledTimes(1)
  await act(async () => {await Promise.resolve()})
  expect(done).toHaveBeenCalledWith('ordered')
  expect(state.report).not.toHaveBeenCalled()
  await act(async () => {finish({todo:'accept',order:'accept',points:'accept'}); await completion})
  expect(state.report).toHaveBeenCalledTimes(3)
})
it('waits for the business request to finish before writing authorization reports', async () => {
  let finish!: () => void
  const operation=vi.fn(() => new Promise<void>(resolve => {finish=resolve})), done=vi.fn()
  state.report.mockImplementation(async () => {expect(done).toHaveBeenCalledTimes(1)})
  await render()
  let completion!: Promise<void>
  act(() => {completion=controller.run(operation,done)})
  await act(async () => {await Promise.resolve()})
  expect(state.stored.size).toBe(3)
  expect(state.report).not.toHaveBeenCalled()
  await act(async () => {finish(); await completion})
  expect(state.stored.size).toBe(0)
})
it('continues business when no remembered consent exists, outside WeChat, or the native request fails', async () => {
  state.remembered.mockResolvedValue([])
  await render()
  const operation=vi.fn().mockResolvedValue('done')
  await act(async () => {await controller.run(operation)})
  expect(state.request).not.toHaveBeenCalled()
  act(() => tree!.unmount()); state.supported=false; await render()
  await act(async () => {await controller.run(operation)})
  expect(state.request).not.toHaveBeenCalled()
  act(() => tree!.unmount()); state.supported=true; state.remembered.mockResolvedValue(['todo']); state.request.mockRejectedValueOnce(new Error('platform unavailable')); await render()
  await act(async () => {await controller.run(operation)})
  expect(operation).toHaveBeenCalledTimes(3)
  expect(controller.error?.message).toContain('微信提醒补充未完成')
})
it('keeps credits pending for recovery when the business result is uncertain', async () => {
  await render()
  await act(async () => {await controller.run(async () => {state.pending=true})})
  expect(state.stored.size).toBe(3)
  expect(state.report).not.toHaveBeenCalled()
  state.pending=false
  await act(async () => {await controller.run(async () => 'another action')})
  expect(state.request).toHaveBeenCalledTimes(1)
  expect(state.stored.size).toBe(0)
})
it('replenishes on repeated actions with distinct report IDs and prevents double submissions', async () => {
  await render()
  const operation=vi.fn().mockResolvedValue('done')
  await act(async () => {await Promise.all([controller.run(operation),controller.run(operation)])})
  expect(operation).toHaveBeenCalledTimes(1)
  await act(async () => {await controller.run(operation)})
  expect(state.request).toHaveBeenCalledTimes(2)
  expect(new Set(state.report.mock.calls.map(call => call[3])).size).toBe(6)
})
it('does not start overlapping native requests across pages while both business actions continue', async () => {
  let finish!: (value: Record<string,string>) => void
  state.request.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
  await act(async () => {tree=create(<><Probe/><Probe index={1}/></>)})
  const first=vi.fn().mockResolvedValue('navigate'), second=vi.fn().mockResolvedValue('new page action')
  let completion!: Promise<void>
  act(() => {completion=controller.run(first)})
  await act(async () => {await secondary.run(second)})
  expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1)
  expect(state.request).toHaveBeenCalledTimes(1)
  await act(async () => {finish({todo:'accept',order:'accept',points:'accept'}); await completion})
  expect(state.report).toHaveBeenCalledTimes(3)
})
it('ignores late subscription results after an account change without undoing the finished business action', async () => {
  let finish!: (value: Record<string,string>) => void
  state.request.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
  await render()
  const operation=vi.fn().mockResolvedValue('done')
  let completion!: Promise<void>
  act(() => {completion=controller.run(operation)})
  state.actor='bob'
  await act(async () => {finish({todo:'accept',order:'accept',points:'accept'}); await completion})
  expect(operation).toHaveBeenCalledTimes(1)
  expect(state.report).not.toHaveBeenCalled(); expect(state.stored.size).toBe(0)
})
