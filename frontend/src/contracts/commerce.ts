export interface Product {
  id: string; ownerId: string; name: string; description: string; coverId: string
  price: number; stock: number; createdAt: string; updatedAt: string
}
export interface Catalog { products: Product[]; ownerId: string; balance: number }
export interface ProductDetail { product: Product; balance: number }
export interface Cart { items: Product[]; balance: number }
export type OrderStatus = 'pending' | 'fulfilling' | 'awaiting_receipt' | 'completed' | 'rejected' | 'cancelled'
export type OrderAction = 'accept' | 'reject' | 'fulfill' | 'confirm' | 'reject_fulfillment' | 'request_cancel' | 'approve_cancel' | 'deny_cancel' | 'cancel'
export interface Snapshot { name: string; description: string; coverId: string; price: number }
export interface Order {
  id: string; buyerId: string; sellerId: string; productId: string; snapshot: Snapshot
  status: OrderStatus; cancelPending: boolean; autoConfirmAt: string | null; refunded: number; penalty: number
  endedReason: string; createdAt: string; updatedAt: string; allowedActions: OrderAction[]
}
export interface OrderDetail {
  order: Order; balance: number; serverTime: string
  history: { id: string; actorId: string | null; action: string; occurredAt: string }[]
}
export interface OrderReceipt {
  orderId: string; action: string; charged: number; refunded: number; penalty: number
  buyerBalance: number; sellerBalance: number; occurredAt: string; snapshot: Snapshot
}
export interface OrderPage { items: Order[]; nextCursor: string }
export interface AccountHistory { entries: { id: string; orderId: string | null; taskId: string | null; giftId: string | null; reason: string; amount: number; balanceAfter: number; createdAt: string }[] }
