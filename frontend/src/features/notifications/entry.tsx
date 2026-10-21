import { useQuery } from '@tanstack/react-query'
import { Button } from '@tarojs/components'
import { useVisible } from '../../app/hooks'
import { getUnread } from './api'
import { getContext } from '../identity/api'
import { keys } from '../../core/query'
import { session } from '../../core/api'
import { navigate } from '../../platform'

export function MessageEntry() {
  const visible = useVisible()
  const context = useQuery({ queryKey: keys.context, queryFn: getContext, enabled: visible && !!session() })
  const unread = useQuery({ queryKey: keys.unread, queryFn: getUnread, enabled: visible && context.data?.stage === 'ready', refetchInterval: visible ? 30000 : false })
  if (context.data?.stage !== 'ready') return null
  return <Button className='message-entry text-button' ariaLabel={`消息中心${unread.data?.count ? `，${unread.data.count} 条未读` : ''}`} onClick={() => void navigate('/packages/account/messages/index')}>消息{unread.data?.count ? ` · ${unread.data.count}` : ''}</Button>
}
