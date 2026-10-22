import { useEffect, useState } from 'react'
import { ApiError, rejectUnauthorized, session } from './api'
import { downloadCover, releaseCover, uploadCover } from '../platform/media'

const cache = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()
let account = ''
function scope() {
  const current = session()?.token || ''
  if (account !== current) {
    for (const path of cache.values()) releaseCover(path)
    cache.clear(); inFlight.clear(); account = current
  }
  return current
}
export function clearMedia() { for (const path of cache.values()) releaseCover(path); cache.clear(); inFlight.clear(); account = '' }
export async function uploadMedia(path: string, purpose: 'cover' | 'avatar' = 'cover') {
  const token = session()?.token
  if (!token) throw new ApiError('UNAUTHENTICATED', '请重新登录', 401)
  let result: Awaited<ReturnType<typeof uploadCover>>
  try { result = await uploadCover(path, token, purpose) } catch { throw new ApiError('NETWORK', '图片上传中断，请重新上传，其他输入已保留', 0) }
  if (session()?.token !== token) throw new ApiError('SESSION_CHANGED', '登录身份已变化，请重新选择图片', 0)
  let body: { fileId?: string; error?: { code: string; message: string } }
  try { body = JSON.parse(result.data) } catch { throw new ApiError('INVALID_RESPONSE', '图片上传结果无法识别，请重试', 0) }
  if (result.statusCode !== 200 || !body.fileId) {
    if (result.statusCode === 401) rejectUnauthorized(token)
    throw new ApiError(body.error?.code || 'UPLOAD_FAILED', body.error?.message || '图片上传失败，请重试', result.statusCode)
  }
  return body.fileId
}
async function readMedia(fileId: string) {
  const actor = scope(), token = session()?.token
  if (!token) throw new Error('请重新登录后读取图片')
  if (cache.has(fileId)) return cache.get(fileId)!
  if (inFlight.has(fileId)) return inFlight.get(fileId)!
  const work = (async () => {
    const result = await downloadCover(fileId, token)
    if (session()?.token !== token || account !== actor) { releaseCover(result.tempFilePath); throw new Error('登录身份已变化') }
    if (result.statusCode !== 200) {
      releaseCover(result.tempFilePath)
      if (result.statusCode === 401) rejectUnauthorized(token)
      throw new Error('图片暂时无法读取，点击重试')
    }
    if (cache.size >= 32) { const oldest = cache.keys().next().value!; releaseCover(cache.get(oldest)!); cache.delete(oldest) }
    cache.set(fileId, result.tempFilePath)
    return result.tempFilePath
  })()
  inFlight.set(fileId, work)
  try { return await work } finally { if (inFlight.get(fileId) === work) inFlight.delete(fileId) }
}
export function useMedia(fileId: string) {
  const actor = session()?.user.id
  const [state, set] = useState<{ id: string; actor?: string; path?: string; error?: string }>({ id: fileId, actor })
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let active = true
    if (!fileId) return
    void readMedia(fileId).then(path => { if (active) set({ id: fileId, actor, path }) }, () => { if (active) set({ id: fileId, actor, error: '图片暂时无法读取，点击重试' }) })
    return () => { active = false }
  }, [fileId, actor, attempt])
  return {
    ...(state.id === fileId && state.actor === actor ? state : {}),
    retry: () => { const path = cache.get(fileId); if (path) releaseCover(path); cache.delete(fileId); set({ id: fileId, actor }); retry(n => n + 1) },
    invalidate: () => { const path = cache.get(fileId); if (path) releaseCover(path); cache.delete(fileId); set({ id: fileId, actor, error: '图片暂时无法读取，点击重试' }) },
  }
}
