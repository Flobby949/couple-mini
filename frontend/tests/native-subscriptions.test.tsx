import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { Preference } from '../src/contracts/notifications'
import { subscriptionGroups } from '../src/features/notifications/subscriptions'

const state = vi.hoisted(() => ({
  actor: 'alice', supported: true, pending: false, serial: 0,
  items: [] as Preference[], stored: new Map<string,unknown>(),
  request: vi.fn(), report: vi.fn(), invalidate: vi.fn(), navigate: vi.fn(), toast: vi.fn(),
}))
vi.mock('@tarojs/components', () => ({View: 'view',Text: 'text',Button: 'button'}))
vi.mock('@tarojs/taro', () => ({useDidShow: () => {},default:{showToast:state.toast}}))
vi.mock('@tanstack/react-query', () => ({useQuery: () => ({data: {items: state.items},error: null,refetch: vi.fn()})}))
vi.mock('../src/core/api', () => ({session: () => ({user: {id: state.actor}})}))
vi.mock('../src/core/query', () => ({keys: {preferences: ['preferences']},queries: {invalidateQueries: state.invalidate}}))
vi.mock('../src/core/operations', () => ({pending: () => state.pending || undefined,newKey: () => `report_${++state.serial}`}))
vi.mock('../src/platform', () => ({navigate: state.navigate,storage: {
  read: (key: string) => state.stored.get(key),
  write: (key: string, value: unknown) => state.stored.set(key,value),
  remove: (key: string) => state.stored.delete(key),
}}))
vi.mock('../src/platform/subscription', () => ({get subscriptionSupported() { return state.supported },requestSubscriptions: state.request}))
vi.mock('../src/features/notifications/api', () => ({getPreferences: vi.fn(),reportAuthorization: state.report}))
vi.mock('../src/ui/visual', () => ({Icon: () => null}))
import { SubscriptionCard } from '../src/features/notifications/subscription-card'
import { SubscriptionEntry } from '../src/features/notifications/subscription-entry'

let tree: ReactTestRenderer | undefined
const preference = (code: string, id: string, remaining=0, channel: Preference['channel']='both'): Preference => ({
  code,name: code,group: code.startsWith('O') ? '订单' : '任务',channel,wechatAvailable: true,platformTemplateId: id,authorization: 'accept',authorizationAt: null,reportedRemaining: remaining,
})
function render(group?: '任务' | '订单') { act(() => { tree = create(<SubscriptionCard enabled group={group}/>) }) }
function button(prefix: string) { return tree!.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.startsWith(prefix)))! }
function text() { return JSON.stringify(tree!.toJSON()) }
async function click(prefix: string) { await act(async () => { await button(prefix).props.onClick() }) }
beforeEach(() => {
  vi.clearAllMocks(); state.actor='alice'; state.supported=true; state.pending=false; state.serial=0; state.stored.clear()
  state.items=[preference('T01','shared'),preference('T02','shared'),preference('O01','order',1),preference('T06','confirm',2),preference('T10','cancel',5)]
  state.request.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map(id => [id,'accept'])))
  state.report.mockResolvedValue({}); state.invalidate.mockResolvedValue(undefined); state.toast.mockResolvedValue({})
})
afterEach(() => { act(() => tree?.unmount()); tree=undefined })

it('counts shared templates once, scopes by category and excludes disabled or unavailable channels', () => {
  state.items.push(preference('T03','only-in-app',0,'in_app'),preference('T04','off',0,'off'),{...preference('T07','missing'),wechatAvailable: false})
  const all=subscriptionGroups(state.items), tasks=subscriptionGroups(state.items,'任务')
  expect(all.map(item => [item.id,item.remaining])).toEqual([['shared',0],['order',1],['confirm',2],['cancel',5]])
  expect(tasks.map(item => item.id)).toEqual(['shared','confirm','cancel'])
  expect(tasks[0].items.map(item => item.code)).toEqual(['T01','T02'])
})
it('defaults to the three lowest counts and reports only one grant for a shared template', async () => {
  render()
  expect(text()).toContain('3 种微信模板')
  await click('补充所选提醒')
  expect(state.request).toHaveBeenCalledExactlyOnceWith(['shared','order','confirm'])
  expect(state.report.mock.calls.map(call => call.slice(0,3))).toEqual([['T01','shared','accept'],['O01','order','accept'],['T06','confirm','accept']])
  expect(state.stored.size).toBe(0)
  expect(text()).toContain('3 个微信模板各获得 1 次')
  expect(state.invalidate).toHaveBeenCalledWith()
})
it('retains mixed results with stable report IDs across a failed sync and page reopening', async () => {
  state.request.mockResolvedValueOnce({shared:'accept',order:'reject',confirm:'filter'})
  state.report.mockRejectedValueOnce(new Error('offline'))
  render(); await click('补充所选提醒')
  const reportId=state.report.mock.calls[0][3]
  expect(state.stored.size).toBe(3)
  expect(button('补充所选提醒').props.disabled).toBe(true)
  act(() => tree!.unmount()); render()
  await click('同步订阅结果')
  expect(state.request).toHaveBeenCalledTimes(1)
  expect(state.report.mock.calls[1]).toEqual(['T01','shared','accept',reportId])
  expect(state.report.mock.calls.slice(1).map(call => call[2])).toEqual(['accept','reject','filter'])
  expect(state.stored.size).toBe(0)
})
it('keeps only the unsynced reports when a later report fails', async () => {
  state.report.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'))
  render(); await click('补充所选提醒')
  expect(state.stored.size).toBe(2)
  await click('同步订阅结果')
  expect(state.report.mock.calls.filter(call => call[0]==='T01')).toHaveLength(1)
  expect(state.stored.size).toBe(0)
})
it('lets users clear obsolete local reports after template consolidation without reassigning credits', async () => {
  state.items=[preference('T01','old-template')]
  state.report.mockRejectedValueOnce(new Error('offline'))
  render(); await click('补充所选提醒')
  act(() => tree!.unmount())
  state.items=[preference('T01','shared-template')]; render()
  expect(button('同步订阅结果').props.disabled).toBe(true)
  await click('清除旧模板待同步结果')
  expect(state.stored.size).toBe(0)
  expect(state.report).toHaveBeenCalledTimes(1)
  await click('补充所选提醒')
  expect(state.request.mock.calls.map(call => call[0])).toEqual([['old-template'],['shared-template']])
  expect(state.report.mock.calls[1].slice(0,3)).toEqual(['T01','shared-template','accept'])
})
it('does not remove a newer report saved by another page when clearing an old in-memory report', async () => {
  state.items=[preference('T01','old-template')]
  state.report.mockRejectedValueOnce(new Error('offline'))
  render(); await click('补充所选提醒')
  state.items=[preference('T01','shared-template')]
  act(() => tree!.update(<SubscriptionCard enabled/>))
  state.stored.set('subscription-report:alice:T01',{code:'T01',platformTemplateId:'shared-template',result:'accept',reportId:'newer-report'})
  await click('清除旧模板待同步结果')
  expect(state.stored.size).toBe(1)
  expect(button('同步订阅结果').props.disabled).toBe(false)
  await click('同步订阅结果')
  expect(state.report.mock.calls[1]).toEqual(['T01','shared-template','accept','newer-report'])
  expect(state.stored.size).toBe(0)
})
it('does not erase a newer report when an older synchronization finishes late', async () => {
  let finish!: (value: unknown) => void
  state.report.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
  render()
  let completion!: Promise<void>
  act(() => {completion=button('补充所选提醒').props.onClick()})
  await act(async () => {await Promise.resolve()})
  state.stored.set('subscription-report:alice:T01',{code:'T01',platformTemplateId:'shared',result:'accept',reportId:'newer-report'})
  await act(async () => {finish({}); await completion})
  expect(state.stored.get('subscription-report:alice:T01')).toMatchObject({reportId:'newer-report'})
})
it('stops showing reports that another page has already synchronized', async () => {
  state.report.mockRejectedValueOnce(new Error('offline'))
  render(); await click('补充所选提醒')
  state.stored.clear()
  state.items=state.items.map(item => ({...item}))
  act(() => tree!.update(<SubscriptionCard enabled/>))
  expect(button('同步订阅结果')).toBeUndefined()
  await click('补充所选提醒')
  expect(state.request).toHaveBeenCalledTimes(2)
})
it('keeps a result in memory for retry when local persistence fails', async () => {
  const write=vi.spyOn(state.stored,'set').mockImplementationOnce(() => {throw new Error('storage full')})
  render(); await click('补充所选提醒')
  state.items=state.items.map(item => ({...item}))
  act(() => tree!.update(<SubscriptionCard enabled/>))
  expect(button('补充所选提醒').props.disabled).toBe(true)
  await click('同步订阅结果')
  expect(state.report).toHaveBeenCalledTimes(3)
  expect(state.request).toHaveBeenCalledTimes(1)
  expect(button('同步订阅结果')).toBeUndefined()
  write.mockRestore()
})
it('ignores a late authorization when the signed-in account changes and blocks double clicks', async () => {
  let finish!: (result: Record<string,string>) => void
  state.request.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
  render()
  const subscribe=button('补充所选提醒').props.onClick
  act(() => { void subscribe(); void subscribe() })
  expect(state.request).toHaveBeenCalledTimes(1)
  state.actor='bob'
  await act(async () => {finish({shared:'accept',order:'accept',confirm:'accept'})})
  expect(state.report).not.toHaveBeenCalled()
  expect(state.stored.size).toBe(0)
})
it('lets users replace a selection while keeping the limit at three', async () => {
  render()
  await click('选择要补充的提醒')
  let options=tree!.root.findAllByType('button').filter(node => node.props.className?.startsWith('subscription-option '))
  expect(options[3].props.disabled).toBe(true)
  act(() => options[0].props.onClick())
  options=tree!.root.findAllByType('button').filter(node => node.props.className?.startsWith('subscription-option '))
  expect(options[3].props.disabled).toBe(false)
  act(() => options[3].props.onClick())
  await click('补充所选提醒')
  expect(state.request).toHaveBeenCalledWith(['order','confirm','cancel'])
})
it('keeps task entry points within task templates and does not change reception preferences', async () => {
  render('任务'); await click('补充所选提醒')
  expect(state.request).toHaveBeenCalledWith(['shared','confirm','cancel'])
  expect(text()).toContain('接收方式保持原设置')
  expect(text()).toContain('不仅限当前这一笔')
})
it('shows a setup entry when no WeChat channel is enabled and disables subscriptions on H5', async () => {
  state.items=[preference('T01','shared',0,'in_app')]
  render('任务')
  expect(button('补充所选提醒')).toBeUndefined()
  await click('设置微信接收方式')
  expect(state.navigate).toHaveBeenCalledWith('/packages/account/notification-settings/index')
  act(() => tree!.unmount()); state.items=[preference('T01','shared')]; state.supported=false; render()
  expect(button('补充所选提醒').props.disabled).toBe(true)
  expect(text()).toContain('请在微信小程序中')
  expect(state.request).not.toHaveBeenCalled()
})

function renderHeader(enabled=true) {act(() => {tree=create(<SubscriptionEntry enabled={enabled}/>)})}
function headerButton() {return tree!.root.findByProps({className:'header-subscription'})}
it('the small header button subscribes in the click and reports completion without a content card', async () => {
  renderHeader()
  expect(state.request).not.toHaveBeenCalled()
  act(() => headerButton().props.onClick())
  expect(state.request).toHaveBeenCalledExactlyOnceWith(['shared','order','confirm'])
  await act(async () => {await Promise.resolve()})
  expect(state.report).toHaveBeenCalledTimes(3)
  expect(state.toast).toHaveBeenLastCalledWith({title:'订阅结果已同步',icon:'none'})
  expect(tree!.root.findAllByProps({className:'surface subscription-card'})).toHaveLength(0)
})
it('hides the subscription header while its page is not visible', () => {
  renderHeader(false)
  expect(tree!.toJSON()).toBeNull()
  expect(state.request).not.toHaveBeenCalled()
})
it('opens notification settings when there is no enabled WeChat template', () => {
  state.items=[preference('T01','shared',0,'in_app')]
  renderHeader(); act(() => headerButton().props.onClick())
  expect(state.navigate).toHaveBeenCalledWith('/packages/account/notification-settings/index')
  expect(state.request).not.toHaveBeenCalled()
})
it('explains WeChat-only subscription when the header is clicked on H5', () => {
  state.supported=false; renderHeader(); act(() => headerButton().props.onClick())
  expect(state.toast).toHaveBeenCalledWith({title:'请在微信小程序中补充提醒',icon:'none'})
  expect(state.request).not.toHaveBeenCalled()
})
it('retries pending header reports without requesting another subscription', async () => {
  state.report.mockRejectedValueOnce(new Error('offline'))
  renderHeader()
  await act(async () => {headerButton().props.onClick()})
  expect(headerButton().props.ariaLabel).toBe('同步微信订阅结果')
  await act(async () => {headerButton().props.onClick()})
  expect(state.request).toHaveBeenCalledTimes(1)
  expect(state.stored.size).toBe(0)
})
it('sends obsolete header reports to notification settings for recovery', () => {
  state.stored.set('subscription-report:alice:T01',{code:'T01',platformTemplateId:'old-template',result:'accept',reportId:'old-report'})
  renderHeader(); act(() => headerButton().props.onClick())
  expect(state.navigate).toHaveBeenCalledWith('/packages/account/notification-settings/index')
  expect(state.report).not.toHaveBeenCalled()
})
