import { Text } from '@tarojs/components'

export function OrderBadge({ count }: { count: number }) {
  return count > 0 ? <Text className='order-count-badge'>{count > 99 ? '99+' : count}</Text> : null
}
