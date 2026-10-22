import Taro from '@tarojs/taro'

type Entry = { id: string; path: string; size: number }
type Index = { owner: string; files: Entry[] }
const key = 'media-cache-v1'
const maxBytes = 32 * 1024 * 1024
let index: Index | undefined
let sequence = 0
const native = () => process.env.TARO_ENV === 'weapp'
function load() {
  if (!index) index = Taro.getStorageSync(key) || { owner: '', files: [] }
  return index!
}
function remove(path: string) {
  try { Taro.getFileSystemManager().unlinkSync(path) } catch { /* Already removed by the platform. */ }
}
function write() { Taro.setStorageSync(key, index) }
export function coverExists(path: string) {
  if (!native()) return true
  try { Taro.getFileSystemManager().accessSync(path); return true } catch { return false }
}
function makeRoom(state: Index, size: number) {
  while (state.files.length && (state.files.length >= 32 || state.files.reduce((sum, file) => sum + file.size, 0) + size > maxBytes)) {
    remove(state.files.shift()!.path)
  }
}
export function clearCachedCovers() {
  if (!native()) return
  try {
    for (const file of load().files) remove(file.path)
    Taro.removeStorageSync(key)
  } catch { /* Caching must not prevent logout. */ }
  index = undefined
}
function scope(owner: string) {
  const identity = `${API_BASE}:${owner}`
  if (load().owner !== identity) {
    clearCachedCovers()
    index = { owner: identity, files: [] }
  }
  return index!
}
export function cachedCover(owner: string, id: string) {
  if (!native()) return
  try {
    const files = scope(owner).files
    const file = files.find(entry => entry.id === id)
    if (!file) return
    if (!coverExists(file.path)) { forgetCachedCover(id); return }
    if (files[files.length - 1] !== file) {
      files.splice(files.indexOf(file), 1); files.push(file); write()
    }
    return file.path
  } catch { return undefined }
}
export function forgetCachedCover(id: string) {
  if (!native()) return
  try {
    const state = load()
    for (const file of state.files.filter(entry => entry.id === id)) remove(file.path)
    state.files = state.files.filter(entry => entry.id !== id)
    write()
  } catch { /* Retry can still download a fresh copy. */ }
}
export async function cacheCover(owner: string, id: string, tempPath: string) {
  if (!native()) return tempPath
  let path: string | undefined
  try {
    const state = scope(owner), fs = Taro.getFileSystemManager()
    const size = (fs.statSync(tempPath) as Taro.Stats).size
    if (size > maxBytes) return tempPath
    makeRoom(state, size)
    write()
    path = `${Taro.env.USER_DATA_PATH}/couple-media-${id}-${Date.now()}-${sequence++}`
    const destPath = path
    await new Promise<void>((resolve, reject) => fs.copyFile({ srcPath: tempPath, destPath, success: () => resolve(), fail: reject }))
    if (index !== state) { remove(path); return tempPath }
    // Other downloads may have completed while this file was being copied.
    makeRoom(state, size)
    state.files.push({ id, path, size })
    write()
    return path
  } catch {
    if (path) {
      remove(path)
      if (index) index.files = index.files.filter(file => file.path !== path)
    }
    return tempPath
  }
}
