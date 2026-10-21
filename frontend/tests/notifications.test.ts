import { expect, it, vi } from 'vitest'
import { targetRoute, deliveryNames, channelNames } from '../src/features/notifications/presentation'
import type { MessageTarget } from '../src/contracts/notifications'
const platform = vi.hoisted(() => ({home:vi.fn(),navigate:vi.fn(),redirect:vi.fn(),switchTab:vi.fn()}))
vi.mock('../src/platform',() => platform)
import { rememberTarget, routeContext } from '../src/app/navigation'
import type { Context } from '../src/contracts/api'
const id = 'a'.repeat(32)
it('allows only recognized business destinations with validated IDs', () => {
  expect(targetRoute({type:'task',id})).toEqual({path:`/packages/tasks/detail/index?id=${id}`})
  expect(targetRoute({type:'rules',id})).toEqual({path:`/packages/account/rules/index?id=${id}`})
  expect(targetRoute({type:'home',id:''})).toEqual({path:'/pages/home/index',tab:true})
  expect(targetRoute({type:'task',id:'../private'})).toBeUndefined()
  expect(targetRoute({type:'unknown',id} as unknown as MessageTarget)).toBeUndefined()
})
it('preserves message destination through first rules without using a message ID as a proposal ID', async () => {
  rememberTarget('/packages/account/message-detail/index?stamp=123',id)
  await routeContext({stage:'rules'} as Context)
  expect(platform.redirect).toHaveBeenLastCalledWith('/packages/account/rules/index')
  await routeContext({stage:'ready'} as Context)
  expect(platform.redirect).toHaveBeenLastCalledWith(`/packages/account/message-detail/index?id=${id}`)
})
it('restores a concrete first proposal and an individual template after gating', async () => {
  rememberTarget('/packages/account/rules/index',id)
  await routeContext({stage:'rules'} as Context)
  expect(platform.redirect).toHaveBeenLastCalledWith(`/packages/account/rules/index?id=${id}`)
  await routeContext({stage:'ready'} as Context)
  rememberTarget('/packages/account/notification-template/index',undefined,'T12')
  await routeContext({stage:'ready'} as Context)
  expect(platform.redirect).toHaveBeenLastCalledWith('/packages/account/notification-template/index?code=T12')
})
it('keeps four preferences distinct and unknown delivery separate from success and retry', () => {
  expect(Object.keys(channelNames)).toHaveLength(4)
  expect(deliveryNames.unknown).toContain('未知')
  expect(deliveryNames.retry).toContain('明确失败')
  expect(deliveryNames.succeeded).toContain('接口已确认')
})
