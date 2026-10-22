import { beforeEach, expect, it, vi } from 'vitest'
const taro = vi.hoisted(() => ({ uploadFile: vi.fn(), downloadFile: vi.fn(), chooseMedia: vi.fn(), getFileInfo: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: taro }))
import { checkUploadSize, chooseCover, downloadCover, uploadCover } from '../src/platform/media'
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
it('uploads avatars through the authenticated profile endpoint before binding', () => {
  uploadCover('wxfile://avatar', 'session-token', 'avatar')
  expect(taro.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://localhost:8080/api/v1/profile/avatar', filePath: 'wxfile://avatar', header: { Authorization: 'Bearer session-token' } }))
})
it('selects exactly one image and preserves the platform temporary path', async () => {
  taro.chooseMedia.mockResolvedValue({ tempFiles: [{ size: 123, tempFilePath: '/cover.png' }] })
  expect(await chooseCover()).toBe('/cover.png')
  expect(taro.chooseMedia).toHaveBeenCalledWith(expect.objectContaining({ count: 1, mediaType: ['image'], sizeType: ['original'] }))
})
it('checks native avatar paths and accepts exactly the upload limit', async () => {
  vi.stubEnv('TARO_ENV', 'weapp')
  taro.getFileInfo.mockResolvedValueOnce({ size: 5 * 1024 * 1024 }).mockResolvedValueOnce({ size: 5 * 1024 * 1024 + 1 })
  await expect(checkUploadSize('wxfile://avatar')).resolves.toBeUndefined()
  expect(taro.getFileInfo).toHaveBeenCalledWith({ filePath: 'wxfile://avatar' })
  await expect(checkUploadSize('wxfile://large-avatar')).rejects.toThrow('5 MiB')
  expect(taro.uploadFile).not.toHaveBeenCalled()
})
it('rejects unreadable and empty native files', async () => {
  vi.stubEnv('TARO_ENV', 'weapp')
  taro.getFileInfo.mockRejectedValueOnce({ errMsg: 'file not exist' }).mockResolvedValueOnce({ size: 0 }).mockResolvedValueOnce({ errMsg: 'fail' })
  for (let i = 0; i < 3; i++) await expect(checkUploadSize('wxfile://invalid')).rejects.toThrow('无法读取图片大小')
})
it('does not use the native file API on H5', async () => {
  await checkUploadSize('blob:cover')
  expect(taro.getFileInfo).not.toHaveBeenCalled()
})
