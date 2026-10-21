import { request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Rules } from '../../contracts/api'

export const getRules = (id?: string) => request<Rules>(`/rules${id ? `?id=${id}` : ''}`)
export const proposeRules = (dailyLimit: string) => mutate('/rules', { dailyLimit })
export const confirmRules = (id: string) => mutate<{voidedCount: number}>(`/rules/${id}/confirm`)
