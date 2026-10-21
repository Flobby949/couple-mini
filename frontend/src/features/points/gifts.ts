import { request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Gift, GiftPreview, Reservations } from '../../contracts/tasks'
export const getGiftPreview = () => request<GiftPreview>('/gifts/preview')
export const sendGift = (amount: string) => mutate<Gift>('/gifts', { amount })
export const getGifts = () => request<{ items: Gift[] }>('/gifts')
export const getGift = (id: string) => request<Gift>(`/gifts/${encodeURIComponent(id)}`)
export const getReservations = () => request<Reservations>('/pool/reservations')
