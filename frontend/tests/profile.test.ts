import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  session: { token: 'alice-token', user: { id: 'alice', nickname: '微信用户' }, expiresAt: 'later' },
  request: vi.fn(), mutate: vi.fn(), write: vi.fn(),
}))
vi.mock('../src/core/api', () => ({ session: () => state.session, request: state.request, ApiError: class extends Error {} }))
vi.mock('../src/core/operations', () => ({ mutate: state.mutate }))
vi.mock('../src/platform', () => ({ storage: { write: state.write } }))
vi.mock('../src/core/query', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queries: new QueryClient(), keys: { context: ['context'], home: ['home'] } }
})
import { saveProfile } from '../src/features/identity/api'
import { queries } from '../src/core/query'
beforeEach(() => {
  vi.clearAllMocks(); queries.clear()
  state.session = { token: 'alice-token', user: { id: 'alice', nickname: '微信用户' }, expiresAt: 'later' }
})
it('updates the session, context and home immediately after a saved profile', async () => {
  const user = { id: 'alice', nickname: '新昵称', avatarId: 'saved-file' }
  state.mutate.mockResolvedValue(user)
  queries.setQueryData(['context'], { me: state.session.user, partner: { id: 'bob', nickname: 'Bob' } })
  queries.setQueryData(['home'], { context: { me: state.session.user }, points: { balance: 3 } })
  await expect(saveProfile({ nickname: '新昵称', avatarId: 'saved-file' })).resolves.toEqual(user)
  expect(state.mutate).toHaveBeenCalledWith('/profile', { nickname: '新昵称', avatarId: 'saved-file' })
  expect(state.write).toHaveBeenCalledWith('session', { ...state.session, user })
  expect(queries.getQueryData<{ me: unknown }>(['context'])?.me).toEqual(user)
  expect(queries.getQueryData<{ context: { me: unknown } }>(['home'])?.context.me).toEqual(user)
})
it('does not write a late profile result into a different account', async () => {
  state.mutate.mockImplementation(async () => {
    state.session = { token: 'bob-token', user: { id: 'bob', nickname: 'Bob' }, expiresAt: 'later' }
    return { id: 'alice', nickname: 'Alice', avatarId: 'file' }
  })
  await expect(saveProfile({ nickname: 'Alice', avatarId: 'file' })).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})
