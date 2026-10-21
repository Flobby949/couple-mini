import { request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Rules } from '../../contracts/api'

export const getRules = () => request<Rules>('/rules')
export const proposeRules = (dailyLimit: string) => mutate('/rules', { dailyLimit })
export const confirmRules = (id: string) => mutate(`/rules/${id}/confirm`)
