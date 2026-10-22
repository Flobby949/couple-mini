import { request } from '../../core/api'
import { mutate, newKey } from '../../core/operations'
import type { Channel, Delivery, Message, Preference } from '../../contracts/notifications'

export const getMessages = (filter: string, cursor = '') => request<{items: Message[]; nextCursor: string}>(`/notifications?filter=${filter}&cursor=${encodeURIComponent(cursor)}`)
export const getMessage = (id: string) => request<Message>(`/notifications/${id}`)
export const getUnread = () => request<{count: number}>('/notifications/unread')
export const readMessages = (ids: string[]) => mutate('/notifications/read', { ids })
export const readAllMessages = () => mutate<{read: number}>('/notifications/read-all')
export const readRuleMessage = (id: string) => mutate(`/rules/${id}/read-notification`)
export const getPreferences = () => request<{items: Preference[]}>('/notification-preferences')
export const savePreference = (code: string, channel: Channel) => mutate(`/notification-preferences/${code}`, { channel })
// The persisted reportId deduplicates retries without blocking business recovery.
export const reportAuthorization = (code: string, platformTemplateId: string, result: string, reportId: string) => request(`/notification-authorizations/${code}`, 'POST', { platformTemplateId, result, reportId }, newKey())
export const getDeliveries = (code: string) => request<{items: Delivery[]}>(`/notification-deliveries?template=${encodeURIComponent(code)}`)
