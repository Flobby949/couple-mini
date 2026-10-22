import Taro from '@tarojs/taro'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function checkSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new Error('无法读取图片大小，请重新选择')
  if (size > MAX_IMAGE_BYTES) throw new Error('图片不能超过 5 MiB')
}

export async function checkUploadSize(path: string) {
  // H5 selections carry their File size; native chooseAvatar only returns a path.
  if (process.env.TARO_ENV !== 'weapp') return
  const file = await Taro.getFileInfo({ filePath: path }).catch(() => {
    throw new Error('无法读取图片大小，请重新选择')
  })
  if (!('size' in file)) throw new Error('无法读取图片大小，请重新选择')
  checkSize(file.size)
}

export async function chooseCover() {
  const result = await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'] }).catch((error: unknown) => {
    const message = error && typeof error === 'object' && 'errMsg' in error ? String(error.errMsg) : error instanceof Error ? error.message : ''
    throw new Error(message.includes('cancel') ? 'chooseMedia:cancel' : '无法选择照片，请检查相册或相机权限后重试。')
  })
  const file = result.tempFiles[0]
  if (!file) throw new Error('未选择图片')
  checkSize(file.size)
  return file.tempFilePath
}
export async function chooseProductCover() {
  const path = await chooseCover()
  if (process.env.TARO_ENV !== 'weapp') return path
  const result = await Taro.cropImage({ src: path, cropScale: '1:1' }).catch((error: unknown) => {
    const message = error && typeof error === 'object' && 'errMsg' in error ? String(error.errMsg) : error instanceof Error ? error.message : ''
    if (message.includes('cancel')) throw new Error('cropImage:cancel')
    if (message.includes('开发者工具')) throw new Error('开发者工具暂不支持裁切，请在手机微信中选择封面。')
    throw new Error('图片裁切失败，请重新选择后重试。')
  })
  if (!result.tempFilePath) throw new Error('未获得裁切后的图片，请重试。')
  return result.tempFilePath
}
export const uploadCover = (path: string, token: string, purpose: 'cover' | 'avatar' = 'cover') => Taro.uploadFile({
  url: `${API_BASE}${purpose === 'avatar' ? '/profile/avatar' : '/media'}`, filePath: path, name: 'file', timeout: 30000,
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
