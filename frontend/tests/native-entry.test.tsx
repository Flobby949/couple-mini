import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { Context } from '../src/contracts/api'

const state = vi.hoisted(() => ({
  identity: {user:{id:'alice'},token:'token'} as {user:{id:string};token:string} | undefined,
  show: new Set<() => void>(), getContext: vi.fn(), route: vi.fn(), login: vi.fn(), clear: vi.fn(), platformLogin: vi.fn(),
}))
vi.mock('@tarojs/components', () => ({View:'view',Text:'text',Button:'button',Image:'image',Input:'input'}))
vi.mock('@tarojs/taro', async () => {
  const {useEffect}=await import('react')
  return {useDidShow: (callback: () => void) => useEffect(() => {state.show.add(callback); return () => {state.show.delete(callback)}},[callback])}
})
vi.mock('../src/app/hooks', () => ({routeContext:state.route}))
vi.mock('../src/app/page', () => ({Page: ({children}: {children: React.ReactNode}) => children}))
vi.mock('../src/core/api', () => ({session: () => state.identity}))
vi.mock('../src/core/query', () => ({queries:{clear:state.clear}}))
vi.mock('../src/core/use-action', () => ({useAction: () => ({busy:false,error:null,run:(fn:()=>Promise<void>)=>fn()})}))
vi.mock('../src/features/identity/api', () => ({getContext:state.getContext,login:state.login}))
vi.mock('../src/core/media', () => ({clearMedia:vi.fn()}))
vi.mock('../src/features/orders/checkout-intent', () => ({clearCheckoutPrice:vi.fn()}))
vi.mock('../src/ui/artwork', () => ({brandLogo:'/brand.png'}))
vi.mock('../src/platform', () => ({platformLogin:state.platformLogin,storage:{write: (_key: string,value: typeof state.identity) => {state.identity=value}}}))
import Entry from '../src/pages/entry'

let tree: ReactTestRenderer | undefined
const context = (stage: Context['stage']='ready'): Context => ({stage,me:{id:'alice',nickname:'我'},partner:{id:'bob',nickname:'伴侣'},couple:{id:'couple',dailyLimit:100,doubleDays:0},serverTime:'',businessDate:''})
function render() {act(() => {tree=create(<Entry/>)})}
function button(label: string) {return tree!.root.findAllByType('button').find(node => node.children.includes(label))!}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('DEV_LOGIN',false); state.show.clear()
  state.identity={user:{id:'alice'},token:'token'}
  state.getContext.mockResolvedValue(context()); state.route.mockResolvedValue(undefined)
  state.login.mockResolvedValue({user:{id:'alice'},token:'new-token'})
  state.platformLogin.mockResolvedValue({code:'login-code'})
})
afterEach(() => {act(() => tree?.unmount()); tree=undefined; vi.unstubAllGlobals()})

it.each(['ready','binding','rules'] as const)('automatically routes an existing session at stage %s', async stage => {
  state.getContext.mockResolvedValue(context(stage)); render()
  await act(async () => {for (const callback of [...state.show]) callback()})
  expect(state.getContext).toHaveBeenCalledTimes(1)
  expect(state.route).toHaveBeenCalledWith(context(stage))
})
it('keeps a logged-out welcome page without attempting automatic entry', async () => {
  state.identity=undefined; render()
  await act(async () => {for (const callback of [...state.show]) callback()})
  expect(state.getContext).not.toHaveBeenCalled(); expect(state.route).not.toHaveBeenCalled()
  expect(button('微信登录')).toBeDefined()
})
it('enters automatically after successful login without asking for another continue click', async () => {
  state.identity=undefined; render()
  await act(async () => {button('微信登录').props.onClick()})
  expect(state.login).toHaveBeenCalledWith({code:'login-code'})
  expect(state.clear).toHaveBeenCalledTimes(1)
  expect(state.route).toHaveBeenCalledWith(context())
})
it('retains manual continue as a fallback for an existing session', async () => {
  render()
  await act(async () => {button('继续进入').props.onClick()})
  expect(state.route).toHaveBeenCalledWith(context())
})
