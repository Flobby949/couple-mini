import Taro from '@tarojs/taro'

export async function chooseCover() {
  const result = await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
  const file = result.tempFiles[0]
  if (!file) throw new Error('未选择图片')
  if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5 MiB')
  return file.tempFilePath
}
export const uploadCover = (path: string, token: string) => Taro.uploadFile({
  url: `${API_BASE}/media`, filePath: path, name: 'file', timeout: 30000,
  header: { Authorization: `Bearer ${token}` },
  ...(process.env.TARO_ENV === 'h5' ? { withCredentials: false } : {}),
})
export const downloadCover = (fileId: string, token: string) => Taro.downloadFile({
  url: `${API_BASE}/media/${encodeURIComponent(fileId)}`, timeout: 15000,
  header: { Authorization: `Bearer ${token}` },
  ...(process.env.TARO_ENV === 'h5' ? { withCredentials: false } : {}),
})
export function releaseCover(path: string) {
  if (process.env.TARO_ENV === 'h5' && path.startsWith('blob:')) URL.revokeObjectURL(path)
}
