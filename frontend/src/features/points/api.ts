import { request } from '../../core/api'
import type { History } from '../../contracts/api'
export const getPoolHistory = () => request<History>('/history')
