import Taro from '@tarojs/taro'
export const subscriptionSupported = process.env.TARO_ENV === 'weapp'
export async function rememberedSubscriptions(): Promise<string[]> {
  if (!subscriptionSupported) return []
  try {
    const settings = (await Taro.getSetting({withSubscriptions: true})).subscriptionsSetting
    return settings?.mainSwitch ? Object.entries(settings.itemSettings || {}).filter(([,value]) => value === 'accept').map(([id]) => id) : []
  } catch { return [] }
}
// Called directly from the user's click; mappings are loaded before this point.
export async function requestSubscriptions(templateIds: string[]): Promise<Record<string,string>> {
  const ids = [...new Set(templateIds.filter(Boolean))].slice(0,3)
  if (!ids.length) return {}
  if (!subscriptionSupported) return Object.fromEntries(ids.map(id => [id,'unavailable']))
  try {
    // Taro 4.3 types incorrectly require the Alipay-only entityIds as well.
    const result = await Taro.requestSubscribeMessage({ tmplIds: ids } as Taro.requestSubscribeMessage.Option)
    return Object.fromEntries(ids.map(id => {
      const value = (result as Record<string,unknown>)[id]
      return [id,typeof value === 'string' && ['accept','reject','ban','filter'].includes(value) ? value : 'fail']
    }))
  } catch { return Object.fromEntries(ids.map(id => [id,'fail'])) }
}
export async function requestSubscription(templateId: string): Promise<string> {
  return (await requestSubscriptions([templateId]))[templateId] || 'fail'
}
