import { ApiError, request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Task, TaskAction, TaskDetail, TaskInput, TaskKind, TaskPage, TaskReceipt } from '../../contracts/tasks'

export const getTasks = (kind: TaskKind, filter: string, cursor = '') => request<TaskPage>(`/tasks?kind=${kind}&filter=${encodeURIComponent(filter)}&cursor=${encodeURIComponent(cursor)}`)
export async function getOpenTasks() {
  const groups = await Promise.all((['joint', 'partner'] as const).map(async kind => {
    const items: Task[] = []
    let cursor = ''
    do {
      const page = await getTasks(kind, 'active', cursor)
      items.push(...page.items)
      cursor = page.nextCursor
    } while (cursor)
    return items
  }))
  return groups.flat()
}
export async function getTask(id: string) {
  const data = await request<TaskDetail>(`/tasks/${encodeURIComponent(id)}`)
  if (!data?.task || !['pending','active','awaiting','completed','rejected','cancelled','expired','timed_out'].includes(data.task.status) || !Array.isArray(data.task.allowedActions)) throw new ApiError('INCOMPATIBLE_RESPONSE', '任务状态暂时无法识别，请更新或重新读取', 0)
  return data
}
export const saveTask = (id: string | undefined, input: TaskInput) => mutate<TaskReceipt>(`/tasks${id ? '/' + encodeURIComponent(id) : ''}`, input)
export const actOnTask = (id: string, action: Exclude<TaskAction, 'edit'>, extra: { correctionDeadline?: string; cancelRequestId?: string } = {}) => mutate<TaskReceipt>(`/tasks/${encodeURIComponent(id)}/actions`, { action, ...extra })
