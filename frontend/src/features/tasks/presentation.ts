import type { Task } from '../../contracts/tasks'
export const taskStatuses = { pending: '待接受', active: '进行中', awaiting: '待确认完成', completed: '已完成', rejected: '已拒绝', cancelled: '已取消', expired: '未接受到期', timed_out: '已接受超时' }
export const taskActions = { edit: '编辑约定', accept: '接受任务', reject_accept: '拒绝任务', submit: '提交完成', confirm: '确认完成', reject_completion: '驳回补正', request_cancel: '申请取消', approve_cancel: '同意取消', deny_cancel: '拒绝取消' }
export const taskHistoryNames: Record<string, string> = { created: '发布并预留奖励', edited: '修改接受前的约定', unchanged: '约定未变化', ...taskActions, expired: '未接受到期，预留已释放', timed_out: '已接受超时，释放预留并罚分' }
export function taskStatus(task: Task) { return task.status === 'active' && task.correctionDeadline ? '需要补正' : taskStatuses[task.status] || '状态待更新' }
export function taskNeedsAction(task: Task) { return task.allowedActions.some(action => ['accept', 'submit', 'confirm', 'approve_cancel'].includes(action)) }
export function reservationChange(kind: 'joint' | 'partner', reward: number, original: number, available: number) {
  const total = reward * (kind === 'joint' ? 2 : 1), delta = total - original
  return { total, delta, insufficient: delta > available }
}
