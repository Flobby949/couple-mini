export type TaskKind = 'joint' | 'partner'
export type TaskStatus = 'pending' | 'active' | 'awaiting' | 'completed' | 'rejected' | 'cancelled' | 'expired' | 'timed_out'
export type TaskAction = 'edit' | 'accept' | 'reject_accept' | 'submit' | 'confirm' | 'reject_completion' | 'request_cancel' | 'approve_cancel' | 'deny_cancel'
export interface Task {
  id: string; kind: TaskKind; creatorId: string; partnerId: string; name: string; description: string; reward: number; status: TaskStatus
  deadline: string | null; correctionDeadline: string | null; effectiveDeadline: string | null; submittedBy: string | null
  createdAt: string; updatedAt: string; reserved: number; allowedActions: TaskAction[]
  cancelRequest: { id: string; requesterId: string; createdAt: string } | null
}
export interface Award { userId: string; agreed: number; actual: number; unpaid: number; balanceAfter?: number }
export interface TaskReceipt { taskId: string; action: string; name: string; reward: number; reserved: number; released: number; penalty: number; penaltyBalance?: number; awards: Award[]; occurredAt: string }
export interface TaskDetail { task: Task; balance: number; serverTime: string; preview: Award[]; history: { id: string; actorId: string | null; action: string; occurredAt: string; result: TaskReceipt }[] }
export interface TaskPage { items: Task[]; nextCursor: string }
export interface TaskInput { kind: TaskKind; name: string; description: string; reward: string; deadline?: string }
export interface GiftPreview { receiverId: string; dailyLimit: number; singleMax: number; receiverRemaining: number; sendsRemaining: number }
export interface Gift { id: string; senderId: string; receiverId: string; requested: number; actual: number; discarded: number; dailyLimit: number; createdAt: string }
export interface Reservations {
  items: { taskId: string; name: string; kind: TaskKind; reward: number; amount: number; status: TaskStatus }[]
  history: { id: string; taskId: string; name: string; delta: number; reason: string; occurredAt: string }[]
}
