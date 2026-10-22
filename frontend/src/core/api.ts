import Taro from '@tarojs/taro'
import { storage } from '../platform'
import type { User } from '../contracts/api'

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message) }
}
export type Session = { token: string; user: User; expiresAt: string }
export function session() { return storage.read<Session>('session') }
let unauthorized: (() => void) | undefined
export function onUnauthorized(handler: () => void) { unauthorized = handler }
export function rejectUnauthorized(token: string) { if (session()?.token === token) unauthorized?.() }
export async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, key?: string): Promise<T> {
  const token = session()?.token
  let result: Taro.request.SuccessCallbackResult
  try {
    result = await Taro.request({ url: API_BASE + path, method, data: body as object | undefined, timeout: 12000,
      header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    })
  } catch { throw new ApiError('NETWORK', '网络连接中断，请核查操作结果或重试读取', 0) }
  // Account changes invalidate even a late successful response.
  if (token !== session()?.token) throw new ApiError('SESSION_CHANGED', '登录身份已变化，请重新读取', 0)
  const payload = result.data as { error?: { code: string; message: string } }
  if (result.statusCode >= 400) {
    if (result.statusCode === 401 && token) unauthorized?.()
    throw new ApiError(payload?.error?.code || 'SERVER', payload?.error?.message || '服务暂时不可用', result.statusCode)
  }
  return result.data as T
}
