import type { Operation, Pending } from '../contracts/api'
import { online, storage } from '../platform'
import { ApiError, request, session } from './api'

function pendingKey() { return `pending:${session()?.user.id || ''}` }
export function pending() { return storage.read<Pending>(pendingKey()) }
export function clearPending() { storage.remove(pendingKey()) }
export function newKey() { return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}` }
function terminal(result: Operation) { return ['succeeded', 'rejected', 'closed'].includes(result?.status) }
export async function mutate<T>(path: string, body: unknown = {}): Promise<T> {
  if (!await online()) throw new ApiError('OFFLINE', '当前无网络，请联网后重新操作', 0)
  if (pending()) throw new ApiError('PENDING', '有一笔操作结果待核查，请先处理', 0)
  const record: Pending = { key: newKey(), path, body, actor: session()!.user.id, createdAt: new Date().toISOString() }
  const storageKey = pendingKey()
  storage.write(storageKey, record)
  try {
    const result = await request<T>(path, 'POST', body, record.key)
    storage.remove(storageKey)
    return result
  } catch (error) {
    // Only a committed terminal receipt or atomic close permits a new intent.
    // Even a 4xx may have occurred before a request reached idempotency arbitration.
    if (error instanceof ApiError && error.status > 0 && error.status < 500 && session()?.user.id === record.actor) {
      try {
        const result = await request<Operation>(`/operations/${record.key}`)
        if (terminal(result)) storage.remove(storageKey)
      } catch { /* retain the original intent for manual recovery */ }
    }
    throw error
  }
}
export async function recover(close = false): Promise<Operation | undefined> {
  const record = pending(); if (!record) return
  const result = await request<Operation>(`/operations/${record.key}${close ? '/close' : ''}`, close ? 'POST' : 'GET', close ? {} : undefined)
  if (terminal(result)) clearPending()
  else if (result?.status !== 'absent') throw new ApiError('INCOMPATIBLE_RESPONSE', '操作结果暂时无法识别，请稍后再核查', 0)
  return result
}
