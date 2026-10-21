import { request } from '../../core/api'
import type { Home } from '../../contracts/api'
export const getHome = () => request<Home>('/home')
