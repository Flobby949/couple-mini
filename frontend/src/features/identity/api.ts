import { ApiError, request, type Session } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Context } from '../../contracts/api'

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
