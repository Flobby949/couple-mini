import { beforeEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ getFileInfo: vi.fn(), uploadFile: vi.fn(), token: 'session-token' }))
vi.mock('@tarojs/taro', () => ({ default: { getFileInfo: native.getFileInfo, uploadFile: native.uploadFile } }))
vi.mock('../src/core/api', () => ({
  session: () => ({ token: native.token, user: { id: 'alice' } }),
  ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } },
  rejectUnauthorized: vi.fn(),
}))
import { uploadMedia } from '../src/core/media'

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('TARO_ENV', 'weapp'); vi.stubGlobal('API_BASE', 'https://example.com/api/v1')
  native.token = 'session-token'
  native.uploadFile.mockResolvedValue({ statusCode: 200, data: JSON.stringify({ fileId: 'saved-file' }) })
})
it.each(['avatar', 'cover'] as const)('blocks oversized %s before the upload request and preserves the size error', async purpose => {
  native.getFileInfo.mockResolvedValue({ size: 5 * 1024 * 1024 + 1 })
  await expect(uploadMedia('wxfile://large', purpose)).rejects.toThrow('5 MiB')
  expect(native.uploadFile).not.toHaveBeenCalled()
})
it('uploads a valid avatar after checking its local size', async () => {
  native.getFileInfo.mockResolvedValue({ size: 1024 })
  await expect(uploadMedia('wxfile://avatar', 'avatar')).resolves.toBe('saved-file')
  expect(native.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'wxfile://avatar', url: 'https://example.com/api/v1/profile/avatar' }))
})
it('does not upload with a stale account after the asynchronous file check', async () => {
  native.getFileInfo.mockImplementation(async () => { native.token = 'other-session'; return { size: 1024 } })
  await expect(uploadMedia('wxfile://avatar', 'avatar')).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
  expect(native.uploadFile).not.toHaveBeenCalled()
})
