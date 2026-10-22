import Taro from '@tarojs/taro'
import type { MoodAsset } from '../contracts/checkin'

type Entry = { key: string; path: string; bytes: number; revision: string }
const storageKey = 'mood-assets-v1', maxBytes = 4 * 1024 * 1024
const inFlight = new Map<string, Promise<string>>()
const memory = new Map<string, string>()
let files: Entry[] | undefined, sequence = 0, active = 0
const waiting: (() => void)[] = []
const native = () => process.env.TARO_ENV === 'weapp'
const prefix = () => `${Taro.env.USER_DATA_PATH}/flo-mood-`
function entries() {
  if (!files) {
    try {
      const saved: unknown = Taro.getStorageSync(storageKey)
      files = Array.isArray(saved) ? saved.filter((file): file is Entry => !!file && typeof file.key === 'string' && typeof file.path === 'string' && file.path.startsWith(prefix()) && Number.isFinite(file.bytes) && file.bytes > 0 && typeof file.revision === 'string') : []
    } catch { files = [] }
  }
  return files
}
function save() { try { Taro.setStorageSync(storageKey, files); return true } catch { return false } }
function remove(file: Entry) {
  try { if (file.path.startsWith(prefix())) Taro.getFileSystemManager().unlinkSync(file.path) } catch { /* Already removed by the platform. */ }
  memory.delete(file.key)
}
function exists(path: string) {
  try { Taro.getFileSystemManager().accessSync(path); return true } catch { return false }
}
function makeRoom(bytes: number, revision: string) {
  const list = entries()
  const recent = [...new Set([...list].reverse().map(file => file.revision).filter(value => value !== revision))][0]
  for (let i = list.length - 1; i >= 0; i--) if (list[i].revision !== revision && list[i].revision !== recent) remove(list.splice(i, 1)[0])
  while (list.length && (list.length >= 32 || list.reduce((total, file) => total + file.bytes, 0) + bytes > maxBytes)) {
    const old = list.findIndex(file => file.revision !== revision)
    remove(list.splice(old < 0 ? 0 : old, 1)[0])
  }
}
export function cachedMood(asset: MoodAsset) {
  const { url } = asset
  if (!native()) return url
  const list = entries(), index = list.findIndex(file => file.key === url)
  const path = index < 0 ? memory.get(url) : list[index].path
  if (!path) return
  if (!exists(path)) { forgetMood(asset); return }
  if (index >= 0 && index !== list.length - 1) { list.push(list.splice(index, 1)[0]); save() }
  return path
}
export function forgetMood(asset: MoodAsset) {
  const key = asset.url
  memory.delete(key)
  if (!native()) return
  const list = entries()
  for (let i = list.length - 1; i >= 0; i--) if (list[i].key === key) remove(list.splice(i, 1)[0])
  save()
}
async function download<T>(work: () => Promise<T>) {
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve))
  else active++
  try { return await work() } finally { const next = waiting.shift(); if (next) next(); else active-- }
}
export function loadMood(asset: MoodAsset): Promise<string> {
  const cached = cachedMood(asset)
  if (cached) return Promise.resolve(cached)
  const existing = inFlight.get(asset.url)
  if (existing) return existing
  const work = download(async () => {
    const result = await Taro.downloadFile({ url: asset.url, timeout: 12000 })
    if (result.statusCode !== 200) throw new Error('表情暂时无法读取，点击重试')
    const path = result.tempFilePath
    const image = await Taro.getImageInfo({ src: path })
    const fs = Taro.getFileSystemManager(), bytes = (fs.statSync(path) as Taro.Stats).size
    if (image.width !== 336 || image.height !== 336 || image.type.toLowerCase() !== 'png' || bytes !== asset.bytes) throw new Error('表情图片不完整，点击重试')
    const destination = `${prefix()}${asset.revision}-${asset.scheme}-${asset.id}-${Date.now()}-${sequence++}.png`
    try {
      makeRoom(bytes, asset.revision)
      await new Promise<void>((resolve, reject) => fs.copyFile({ srcPath: path, destPath: destination, success: () => resolve(), fail: reject }))
      makeRoom(bytes, asset.revision)
      const entry = { key: asset.url, path: destination, bytes, revision: asset.revision }
      entries().push(entry)
      if (!save()) { entries().splice(entries().indexOf(entry), 1); remove(entry); memory.set(asset.url, path); return path }
      memory.set(asset.url, destination)
      return destination
    } catch {
      // A full disk must not turn a successfully downloaded image into an error.
      memory.set(asset.url, path)
      return path
    }
  })
  inFlight.set(asset.url, work)
  void work.finally(() => { if (inFlight.get(asset.url) === work) inFlight.delete(asset.url) }).catch(() => {})
  return work
}
