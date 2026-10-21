import { mutate } from '../../core/operations'
import type { CheckinResult } from '../../contracts/api'
export const checkIn = () => mutate<CheckinResult>('/checkins')
