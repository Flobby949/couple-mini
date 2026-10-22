import { Text } from '@tarojs/components'

export function TaskBadge({ count }: { count: number }) {
  return count > 0 ? <Text className='task-count-badge'>{count > 99 ? '99+' : count}</Text> : null
}
