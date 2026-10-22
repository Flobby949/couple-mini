import { ApiError, request, session, type Session } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Context, Home, User } from '../../contracts/api'
import { keys, queries } from '../../core/query'
import { storage } from '../../platform'

export const login = (body: { code: string } | { devIdentity: string }) => request<Session>('/login', 'POST', body)
export async function getContext() {
  const context = await request<Context>('/context')
  if (!context?.me?.id || !['binding', 'rules', 'ready'].includes(context.stage) ||
      (context.stage !== 'binding' && (!context.couple || !context.partner)) ||
      (context.stage === 'ready' && context.couple?.dailyLimit == null)) {
    throw new ApiError('INCOMPATIBLE_RESPONSE', '启动信息格式不兼容，请更新或重新读取', 0)
  }
  return context
}
export const invitePartner = () => mutate<{ code: string; expiresAt: string }>('/invitations')
export const bindPartner = (code: string) => mutate('/binding', { code })
export async function saveProfile(body: { nickname: string; avatarId: string }) {
  const identity = session()
  const user = await mutate<User>('/profile', body)
  if (!identity || session()?.token !== identity.token || user.id !== identity.user.id) {
    throw new ApiError('SESSION_CHANGED', '登录身份已变化，请重新读取', 0)
  }
  storage.write('session', { ...identity, user })
  queries.setQueryData<Context>(keys.context, current => current ? { ...current, me: user } : current)
  queries.setQueryData<Home>(keys.home, current => current ? { ...current, context: { ...current.context, me: user } } : current)
  return user
}
