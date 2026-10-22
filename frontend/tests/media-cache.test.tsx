import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

const native = vi.hoisted(() => ({
  storage: new Map<string, unknown>(), files: new Map<string, number>(),
  downloadFile: vi.fn(), copyFile: vi.fn(),
  session: { token: 'alice-token', user: { id: 'alice' } } as { token: string; user: { id: string } } | undefined,
}))
vi.mock('@tarojs/taro', () => ({ default: {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: (key: string) => native.storage.get(key),
  setStorageSync: (key: string, value: unknown) => native.storage.set(key, structuredClone(value)),
  removeStorageSync: (key: string) => native.storage.delete(key),
  downloadFile: native.downloadFile,
  getFileSystemManager: () => ({
    accessSync: (path: string) => { if (!native.files.has(path)) throw new Error('missing') },
    statSync: (path: string) => { if (!native.files.has(path)) throw new Error('missing'); return { size: native.files.get(path) } },
    unlinkSync: (path: string) => native.files.delete(path),
    copyFile: native.copyFile,
  }),
} }))
vi.mock('../src/core/api', () => ({ session: () => native.session, rejectUnauthorized: vi.fn(), ApiError: Error }))

import { clearMedia, useMedia } from '../src/core/media'
let tree: ReactTestRenderer | undefined
let media: ReturnType<typeof useMedia>
const renders: (string | undefined)[] = []
function Cover({ id = 'cover' }: { id?: string }) { media = useMedia(id); renders.push(media.path); return null }
async function mount(id = 'cover') { await act(async () => { tree = create(<Cover id={id}/>) }) }
beforeEach(() => {
  vi.stubEnv('TARO_ENV', 'weapp'); vi.stubGlobal('API_BASE', 'https://example.com/api/v1')
  clearMedia(); native.storage.clear(); native.files.clear(); vi.resetAllMocks(); renders.length = 0
  native.session = { token: 'alice-token', user: { id: 'alice' } }
  native.downloadFile.mockImplementation(async ({ url }: { url: string }) => {
    const tempFilePath = `wxfile://tmp/${url.split('/').pop()}`
    native.files.set(tempFilePath, 1024)
    return { statusCode: 200, tempFilePath }
  })
  native.copyFile.mockImplementation(({ srcPath, destPath, success }: { srcPath: string; destPath: string; success: () => void }) => {
    native.files.set(destPath, native.files.get(srcPath)!); success()
  })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; clearMedia(); vi.unstubAllEnvs() })

it('persists authenticated downloads and shows a cached cover on the first render when returning', async () => {
  await mount()
  expect(media.path).toMatch(/^wxfile:\/\/usr\//)
  expect(native.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ header: { Authorization: 'Bearer alice-token' } }))
  const path = media.path
  act(() => tree!.unmount()); renders.length = 0
  await mount()
  expect(renders[0]).toBe(path)
  expect(native.downloadFile).toHaveBeenCalledTimes(1)
})

it('restores a saved cover after module restart and drops missing files', async () => {
  await mount()
  const path = media.path
  vi.resetModules()
  const saved = await import('../src/platform/media-cache')
  expect(saved.cachedCover('alice', 'cover')).toBe(path)
  native.files.delete(path!)
  expect(saved.cachedCover('alice', 'cover')).toBeUndefined()
})

it('does not reuse another account’s files and clears saved images on logout', async () => {
  await mount()
  const alicePath = media.path!
  native.session = { token: 'bob-token', user: { id: 'bob' } }
  await act(async () => { tree!.update(<Cover/>) })
  expect(native.downloadFile).toHaveBeenCalledTimes(2)
  expect(native.files.has(alicePath)).toBe(false)
  expect(media.path).not.toBe(alicePath)
  const bobPath = media.path!
  clearMedia()
  expect(native.files.has(bobPath)).toBe(false)
})

it('keeps displaying downloaded images when persistent storage is full', async () => {
  native.copyFile.mockImplementation(({ fail }: { fail: () => void }) => fail())
  await mount()
  expect(media.path).toBe('wxfile://tmp/cover')
  expect(media.error).toBeUndefined()
})

it('downloads a missing local file again without showing a stale path', async () => {
  await mount()
  native.files.delete(media.path!)
  act(() => tree!.unmount()); renders.length = 0
  await mount()
  expect(renders[0]).toBeUndefined()
  expect(native.downloadFile).toHaveBeenCalledTimes(2)
  expect(native.files.has(media.path!)).toBe(true)
})

it('keeps H5 using its memory cache without calling native file APIs', async () => {
  vi.stubEnv('TARO_ENV', 'h5')
  await mount()
  const path = media.path
  act(() => tree!.unmount()); renders.length = 0
  await mount()
  expect(renders[0]).toBe(path)
  expect(native.downloadFile).toHaveBeenCalledTimes(1)
  expect(native.copyFile).not.toHaveBeenCalled()
  expect(native.storage.size).toBe(0)
})

it('removes a broken saved cover before retrying its download', async () => {
  await mount()
  const path = media.path!
  act(() => media.invalidate())
  expect(native.files.has(path)).toBe(false)
  await act(async () => media.retry())
  expect(native.downloadFile).toHaveBeenCalledTimes(2)
  expect(media.path).toBeTruthy()
})

it('does not restore or save a late download after the account changes', async () => {
  let finish!: (result: { statusCode: number; tempFilePath: string }) => void
  native.downloadFile.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await mount()
  native.session = undefined; clearMedia()
  await act(async () => finish({ statusCode: 200, tempFilePath: 'wxfile://tmp/late' }))
  expect(native.copyFile).not.toHaveBeenCalled()
  expect(media.path).toBeUndefined()
})

it('deletes a pending file copy that completes after logout', async () => {
  let complete!: () => void
  let savedPath = ''
  native.copyFile.mockImplementationOnce(({ destPath, success }: { destPath: string; success: () => void }) => {
    savedPath = destPath
    complete = () => { native.files.set(destPath, 1024); success() }
  })
  await mount()
  native.session = undefined; clearMedia()
  await act(async () => complete())
  expect(native.files.has(savedPath)).toBe(false)
  expect(media.path).toBeUndefined()
})

it('never saves an image rejected by the server', async () => {
  native.downloadFile.mockResolvedValueOnce({ statusCode: 403, tempFilePath: 'wxfile://tmp/denied' })
  await mount()
  expect(media.path).toBeUndefined()
  expect(media.error).toBeTruthy()
  expect(native.copyFile).not.toHaveBeenCalled()
})

it('bounds saved image space by evicting old covers', async () => {
  native.downloadFile.mockImplementation(async ({ url }: { url: string }) => {
    const tempFilePath = `wxfile://tmp/${url.split('/').pop()}`
    native.files.set(tempFilePath, 5 * 1024 * 1024)
    return { statusCode: 200, tempFilePath }
  })
  await mount('cover-0')
  const oldest = media.path!
  for (let i = 1; i < 8; i++) await act(async () => { tree!.update(<Cover id={`cover-${i}`}/>) })
  const saved = [...native.files].filter(([path]) => path.startsWith('wxfile://usr/'))
  expect(saved.reduce((sum, [, size]) => sum + size, 0)).toBeLessThanOrEqual(32 * 1024 * 1024)
  expect(native.files.has(oldest)).toBe(false)
  await act(async () => { tree!.update(<Cover id='cover-0'/>) })
  expect(native.downloadFile).toHaveBeenCalledTimes(9)
})
