export type Channel = 'in_app' | 'wechat' | 'both' | 'off'
export interface MessageTarget { type: 'order' | 'task' | 'gift' | 'rules' | 'partner' | 'home'; id: string }
export interface Message {
  id: string; sequence: string; template: string; title: string; body: string; target: MessageTarget
  occurredAt: string; receivedAt: string; readAt: string | null; deliveryStatus: string | null; deliveryReason: string | null
}
export interface Preference { code: string; name: string; group: string; channel: Channel; wechatAvailable: boolean; platformTemplateId: string; authorization: string; authorizationAt: string | null; reportedRemaining: number }
export interface Delivery { id: string; title: string; status: string; reason: string; attempts: number; updatedAt: string }
export interface AuthorizationReport { code: string; platformTemplateId: string; result: string }
