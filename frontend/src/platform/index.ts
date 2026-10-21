import Taro from '@tarojs/taro'

export const storage = {
  read<T>(key: string): T | undefined { return Taro.getStorageSync(key) || undefined },
  write(key: string, value: unknown) { Taro.setStorageSync(key, value) },
  remove(key: string) { Taro.removeStorageSync(key) },
}
export async function online() {
  try { return (await Taro.getNetworkType()).networkType !== 'none' } catch { return true }
}
export const platformLogin = () => Taro.login()
export const navigate = (url: string) => Taro.navigateTo({ url })
export const replace = (url: string) => Taro.redirectTo({ url })
export const home = () => Taro.switchTab({ url: '/pages/home/index' })
export const switchTab = (url: string) => Taro.switchTab({ url })
export const redirect = (url: string) => Taro.reLaunch({ url })
export const copy = (data: string) => Taro.setClipboardData({ data })

export const setPageTitle = (title: string) => Taro.setNavigationBarTitle({title}).catch(() => {})
export function topInset() { try { return Taro.getWindowInfo().statusBarHeight || 0 } catch { return 0 } }
export async function back(fallback = '/pages/me/index') {
  if (Taro.getCurrentPages().length > 1) { await Taro.navigateBack(); return }
  return fallback.startsWith('/pages/') ? switchTab(fallback) : replace(fallback)
}
