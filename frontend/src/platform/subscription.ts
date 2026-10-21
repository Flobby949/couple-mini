import Taro from '@tarojs/taro'
export const subscriptionSupported = process.env.TARO_ENV === 'weapp'
// Called directly from the user's click; mappings are loaded before this point.
export async function requestSubscription(templateId: string): Promise<string> {
  if (!subscriptionSupported) return 'unavailable'
  try {
    // Taro 4.3 types incorrectly require the Alipay-only entityIds as well.
    const result = await Taro.requestSubscribeMessage({ tmplIds: [templateId] } as Taro.requestSubscribeMessage.Option)
    const value = (result as Record<string,unknown>)[templateId]
    return typeof value === 'string' && ['accept','reject','ban','filter'].includes(value) ? value : 'fail'
  } catch { return 'fail' }
}
