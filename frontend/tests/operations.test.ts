import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ request: vi.fn(), online: vi.fn(), session: { user: { id: 'alice' } }, data: new Map<string, unknown>(), write: vi.fn() }))
vi.mock('../src/core/api', () => ({
  request: mocks.request, session: () => mocks.session,
  ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } },
}))
vi.mock('../src/platform', () => ({
  online: mocks.online,
  storage: { read: (key: string) => mocks.data.get(key), write: mocks.write, remove: (key: string) => mocks.data.delete(key) },
}))
import { ApiError } from '../src/core/api'
import { mutate, pending, recover } from '../src/core/operations'
import { reportAuthorization } from '../src/features/notifications/api'
beforeEach(() => {
  vi.resetAllMocks(); mocks.data.clear(); mocks.session.user.id = 'alice'; mocks.online.mockResolvedValue(true)
  mocks.write.mockImplementation((key, value) => mocks.data.set(key, value))
})
it('persists the original request before sending and clears a successful intent', async () => {
  mocks.request.mockImplementation(async () => { expect(pending()?.path).toBe('/checkins'); return { total: 10 } })
  expect(await mutate('/checkins')).toEqual({ total: 10 }); expect(pending()).toBeUndefined()
})
it('does not send if recovery data cannot be persisted', async () => {
  mocks.write.mockImplementation(() => { throw new Error('storage full') })
  await expect(mutate('/checkins')).rejects.toThrow('storage full'); expect(mocks.request).not.toHaveBeenCalled()
})
it('does not queue writes while offline', async () => {
  mocks.online.mockResolvedValue(false)
  await expect(mutate('/checkins')).rejects.toThrow('当前无网络'); expect(mocks.request).not.toHaveBeenCalled(); expect(pending()).toBeUndefined()
})
it('keeps an uncertain request across restart and refuses a new intent', async () => {
  mocks.request.mockRejectedValue(new ApiError('NETWORK', 'timeout', 0))
  await expect(mutate('/checkins')).rejects.toThrow('timeout'); const original = pending()
  expect(original?.body).toEqual({})
  await expect(mutate('/rules', { dailyLimit: '5' })).rejects.toThrow('待核查'); expect(pending()).toEqual(original)
  mocks.request.mockResolvedValue({ status: 'absent' }); await recover(); expect(pending()).toEqual(original)
  mocks.request.mockResolvedValue({ status: 'closed' }); await recover(true); expect(pending()).toBeUndefined()
  expect(mocks.request).toHaveBeenLastCalledWith(`/operations/${original!.key}/close`, 'POST', {})
})
it('a 4xx without a committed receipt cannot unlock a replacement intent', async () => {
  mocks.request.mockRejectedValueOnce(new ApiError('INVALID_BODY', 'invalid', 400)).mockResolvedValueOnce({ status: 'absent' })
  await expect(mutate('/rules', { dailyLimit: '-1' })).rejects.toThrow('invalid'); expect(pending()).toBeDefined()
})
it('a confirmed rejection unlocks the form', async () => {
  mocks.request.mockRejectedValueOnce(new ApiError('INVALID_POINTS', 'invalid', 422)).mockResolvedValueOnce({ status: 'rejected' })
  await expect(mutate('/rules', { dailyLimit: '-1' })).rejects.toThrow('invalid'); expect(pending()).toBeUndefined()
})
it('another actor cannot query, clear or resubmit the first actor intent', async () => {
  mocks.request.mockRejectedValue(new ApiError('NETWORK', 'timeout', 0)); await expect(mutate('/checkins')).rejects.toThrow()
  const original = pending(); mocks.session.user.id = 'bob'; expect(pending()).toBeUndefined(); expect(await recover()).toBeUndefined()
  mocks.session.user.id = 'alice'; expect(pending()).toEqual(original)
})
it('does not submit a business mutation for another account after the asynchronous network check', async () => {
  let finish!: (online: boolean) => void
  mocks.online.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const submission = mutate('/checkins')
  const rejected = expect(submission).rejects.toThrow('登录身份已变化')
  mocks.session.user.id = 'bob'
  finish(true)
  await rejected
  expect(mocks.request).not.toHaveBeenCalled()
  expect(mocks.write).not.toHaveBeenCalled()
})
it('authorization sync failures never occupy business recovery and retry with the same report ID', async () => {
  mocks.request.mockRejectedValueOnce(new ApiError('NETWORK','authorization timeout',0))
  await expect(reportAuthorization('T01','template','accept','original_subscription_report')).rejects.toThrow('authorization timeout')
  expect(pending()).toBeUndefined()
  expect(mocks.write).not.toHaveBeenCalled()
  const first = mocks.request.mock.calls[0]
  mocks.request.mockResolvedValueOnce({total:10})
  expect(await mutate('/checkins')).toEqual({total:10})
  mocks.request.mockResolvedValueOnce({id:'authorization'})
  await reportAuthorization('T01','template','accept','original_subscription_report')
  const retry = mocks.request.mock.calls[2]
  expect(retry.slice(0,3)).toEqual(first.slice(0,3))
  expect(retry[3]).not.toBe(first[3])
  expect(pending()).toBeUndefined()
})
it('an unknown server operation state never clears recovery data', async () => {
  mocks.request.mockRejectedValueOnce(new ApiError('NETWORK', 'timeout', 0)); await expect(mutate('/checkins')).rejects.toThrow()
  const original = pending(); mocks.request.mockResolvedValue({ status: 'future-state' })
  await expect(recover()).rejects.toThrow('无法识别'); expect(pending()).toEqual(original)
})
