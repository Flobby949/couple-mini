import type { Preference } from '../../contracts/notifications'

export const lowSubscriptionCount = 2
export interface SubscriptionGroup { id: string; items: Preference[]; remaining: number }
export function subscriptionGroups(items: Preference[], group?: string): SubscriptionGroup[] {
  const groups = new Map<string,SubscriptionGroup>()
  for (const item of items) {
    if (group && item.group !== group || !item.wechatAvailable || !item.platformTemplateId || !['wechat','both'].includes(item.channel)) continue
    const existing = groups.get(item.platformTemplateId)
    if (existing) {
      existing.items.push(item)
      existing.remaining = Math.min(existing.remaining,item.reportedRemaining)
    } else groups.set(item.platformTemplateId,{ id: item.platformTemplateId, items: [item], remaining: item.reportedRemaining })
  }
  return [...groups.values()].sort((a,b) => a.remaining-b.remaining)
}
export function subscriptionName(group: SubscriptionGroup) {
  return group.items[0].name + (group.items.length > 1 ? `等 ${group.items.length} 类提醒` : '')
}
