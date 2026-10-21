export interface User { id: string; nickname: string }
export interface Couple { id: string; dailyLimit: number | null; doubleDays: number }
export interface Context { me: User; partner: User | null; couple: Couple | null; stage: 'binding' | 'rules' | 'ready'; serverTime: string; businessDate: string }
export interface Proposal { id: string; proposerId: string; previousLimit: number | null; dailyLimit: number; status: 'pending' | 'active' | 'void'; createdAt: string }
export interface Rules { dailyLimit: number | null; proposals: Proposal[] }
export interface Home {
  context: Context
  points: { balance: number; earned: number; dailyLimit: number; remaining: number; available: number; reserved: number; total: number }
  checkin: { me: boolean; partner: boolean }
  todos: Proposal[]
  orderTodos: import('./commerce').Order[]
  taskTodos: import('./tasks').Task[]
  milestones: { days: number; reward: number }[]
}
export interface CheckinResult { date: string; base: number; doubleBonus: number; milestoneBonus: number; total: number; doubleDays: number }
export interface Pending { key: string; path: string; body: unknown; actor: string; createdAt: string }
export interface Operation { status: 'absent' | 'succeeded' | 'rejected' | 'closed'; httpStatus?: number; response?: unknown }
export interface History { entries: { id: string; actorId: string; reason: string; amount: number; createdAt: string; taskId?: string | null }[] }
