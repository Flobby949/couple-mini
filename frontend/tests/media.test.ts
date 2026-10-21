import { beforeEach, expect, it, vi } from 'vitest'
const taro = vi.hoisted(() => ({ uploadFile: vi.fn(), downloadFile: vi.fn(), chooseMedia: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: taro }))
import { chooseCover, downloadCover, uploadCover } from '../src/platform/media'
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('TARO_ENV', 'h5'); vi.stubGlobal('API_BASE', 'http://localhost:8080/api/v1') })
it('private upload and download send Bearer auth without H5 cookie credentials', () => {
  uploadCover('blob:cover', 'session-token'); downloadCover('file-id', 'session-token')
  expect(taro.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'file', filePath: 'blob:cover', header: { Authorization: 'Bearer session-token' }, withCredentials: false }))
  expect(taro.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://localhost:8080/api/v1/media/file-id', header: { Authorization: 'Bearer session-token' }, withCredentials: false }))
})
it('client rejects oversized selections before starting upload', async () => {
  taro.chooseMedia.mockResolvedValue({ tempFiles: [{ size: 5 * 1024 * 1024 + 1, tempFilePath: '/too-large.png' }] })
  await expect(chooseCover()).rejects.toThrow('5 MiB'); expect(taro.uploadFile).not.toHaveBeenCalled()
})
it('selects exactly one image and preserves the platform temporary path', async () => {
  taro.chooseMedia.mockResolvedValue({ tempFiles: [{ size: 123, tempFilePath: '/cover.png' }] })
  expect(await chooseCover()).toBe('/cover.png')
  expect(taro.chooseMedia).toHaveBeenCalledWith(expect.objectContaining({ count: 1, mediaType: ['image'] }))
})
