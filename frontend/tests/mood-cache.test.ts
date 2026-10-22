import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MoodAsset, MoodId } from '../src/contracts/checkin'

const native = vi.hoisted(() => ({
  storage: new Map<string, unknown>(), files: new Map<string, number>(),
  download: vi.fn(), copy: vi.fn(), info: vi.fn(), write: vi.fn(),
}))
vi.mock('@tarojs/taro', () => ({ default: {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: (key: string) => native.storage.get(key),
  setStorageSync: (key: string, value: unknown) => { native.write(); native.storage.set(key, structuredClone(value)) },
  downloadFile: native.download,
  getImageInfo: native.info,
  getFileSystemManager: () => ({
    accessSync: (path: string) => { if (!native.files.has(path)) throw new Error('missing') },
    statSync: (path: string) => { if (!native.files.has(path)) throw new Error('missing'); return { size: native.files.get(path) } },
    unlinkSync: (path: string) => native.files.delete(path), copyFile: native.copy,
  }),
} }))
let cache: typeof import('../src/platform/mood-cache')
function asset(id: MoodId = 'happy', scheme: 'light' | 'dark' = 'light', revision = 'v1', origin = 'https://example.com'): MoodAsset {
  return { id, scheme, revision, url: `${origin}/assets/moods/${revision}/${scheme}/${id}.png`, bytes: 65536 }
}
beforeEach(async () => {
  vi.stubEnv('TARO_ENV', 'weapp'); vi.resetModules(); vi.resetAllMocks(); native.files.clear(); native.storage.clear()
  native.download.mockImplementation(async ({ url }: { url: string }) => {
    const tempFilePath = `wxfile://tmp/${url}`; native.files.set(tempFilePath, 65536)
    return { statusCode: 200, tempFilePath }
  })
  native.info.mockResolvedValue({ type: 'png', width: 336, height: 336 })
  native.copy.mockImplementation(({ srcPath, destPath, success }: { srcPath: string; destPath: string; success: () => void }) => { native.files.set(destPath, native.files.get(srcPath)!); success() })
  cache = await import('../src/platform/mood-cache')
})
afterEach(() => { vi.unstubAllEnvs() })

it('deduplicates simultaneous calendar cells and restores a public image after module restart', async () => {
  const images = await Promise.all(Array.from({ length: 20 }, () => cache.loadMood(asset())))
  expect(new Set(images).size).toBe(1); expect(native.download).toHaveBeenCalledTimes(1)
  expect(native.download.mock.calls[0][0].header).toBeUndefined()
  vi.resetModules(); cache = await import('../src/platform/mood-cache')
  expect(cache.cachedMood(asset())).toBe(images[0])
  expect(await cache.loadMood(asset())).toBe(images[0]); expect(native.download).toHaveBeenCalledTimes(1)
})
it('separates scheme, content revision and server origin', async () => {
  const inputs = [asset(), asset('happy', 'dark'), asset('happy', 'light', 'v2'), asset('happy', 'light', 'v1', 'https://other.example')]
  const paths = await Promise.all(inputs.map(value => cache.loadMood(value)))
  expect(native.download).toHaveBeenCalledTimes(4); expect(new Set(paths).size).toBe(4)
  for (const [index, value] of inputs.entries()) expect(cache.cachedMood(value)).toBe(paths[index])
})
it('redownloads files removed by the system and retries an explicitly invalidated file', async () => {
  const first = await cache.loadMood(asset()); native.files.delete(first)
  expect(cache.cachedMood(asset())).toBeUndefined()
  const second = await cache.loadMood(asset()); expect(second).not.toBe(first)
  cache.forgetMood(asset()); expect(native.files.has(second)).toBe(false)
  await cache.loadMood(asset()); expect(native.download).toHaveBeenCalledTimes(3)
})
it('rejects HTTP error pages, wrong dimensions and truncated images without persisting them', async () => {
  native.download.mockResolvedValueOnce({ statusCode: 404, tempFilePath: 'error' })
  await expect(cache.loadMood(asset())).rejects.toThrow()
  native.info.mockResolvedValueOnce({ type: 'png', width: 1, height: 1 })
  await expect(cache.loadMood(asset())).rejects.toThrow()
  await expect(cache.loadMood({ ...asset(), bytes: 123 })).rejects.toThrow()
  expect(native.copy).not.toHaveBeenCalled()
  expect(await cache.loadMood(asset())).toMatch(/^wxfile:\/\/usr\//)
})
it('can display a downloaded temporary file when copying or saving its index fails', async () => {
  native.copy.mockImplementationOnce(({ fail }: { fail: () => void }) => fail())
  expect(await cache.loadMood(asset())).toMatch(/^wxfile:\/\/tmp\//)
  native.write.mockImplementation(() => { throw new Error('storage full') })
  expect(await cache.loadMood(asset('calm'))).toMatch(/^wxfile:\/\/tmp\//)
  expect([...native.files.keys()].filter(path => path.startsWith('wxfile://usr/flo-mood-'))).toHaveLength(0)
})
it('only retains the current and previous asset revisions and bounds the file count', async () => {
  const first = await cache.loadMood(asset('happy', 'light', 'v1'))
  const second = await cache.loadMood(asset('happy', 'light', 'v2'))
  await cache.loadMood(asset('happy', 'light', 'v3'))
  expect(native.files.has(first)).toBe(false); expect(native.files.has(second)).toBe(true)
  for (let i = 0; i < 35; i++) await cache.loadMood(asset('calm', 'light', 'v3', `https://example${i}.com`))
  const saved = [...native.files].filter(([path]) => path.startsWith('wxfile://usr/flo-mood-'))
  expect(saved.length).toBeLessThanOrEqual(32)
  expect(saved.reduce((sum, [, size]) => sum + size, 0)).toBeLessThanOrEqual(4 * 1024 * 1024)
})
it('hands off two download slots without starting all eight requests at once', async () => {
  const finish: (() => void)[] = []
  native.download.mockImplementation(({ url }: { url: string }) => new Promise(resolve => finish.push(() => {
    const tempFilePath = `wxfile://tmp/${url}`; native.files.set(tempFilePath, 65536); resolve({ statusCode: 200, tempFilePath })
  })))
  const inputs = ['happy', 'calm', 'loving', 'missing', 'tired', 'sad', 'irritated', 'energetic'] as const
  const tasks = inputs.map(id => cache.loadMood(asset(id)))
  expect(native.download).toHaveBeenCalledTimes(2)
  for (let batch = 0; batch < 4; batch++) {
    const ready = finish.splice(0); expect(ready).toHaveLength(2)
    ready.forEach(done => done())
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  await Promise.all(tasks); expect(native.download).toHaveBeenCalledTimes(8)
})
it('lets H5 use immutable HTTP URLs without downloading or copying files in JavaScript', async () => {
  vi.stubEnv('TARO_ENV', 'h5')
  expect(await cache.loadMood(asset())).toBe(asset().url)
  expect(native.download).not.toHaveBeenCalled(); expect(native.copy).not.toHaveBeenCalled()
})
