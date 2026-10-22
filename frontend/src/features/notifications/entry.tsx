import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useVisible } from '../../app/hooks'
import { getUnread } from './api'
import { getContext } from '../identity/api'
import { keys } from '../../core/query'
import { session } from '../../core/api'
import { navigate } from '../../platform'
import { Icon } from '../../ui/visual'
import { SubscriptionEntry } from './subscription-entry'
export function MessageEntry({icon=false,subscription=false}:{icon?:boolean;subscription?:boolean}) {
 const visible=useVisible()
 const context=useQuery({queryKey:keys.context,queryFn:getContext,enabled:visible&&!!session()})
 const unread=useQuery({queryKey:keys.unread,queryFn:getUnread,enabled:visible&&context.data?.stage==='ready',refetchInterval:visible?30000:false})
 if(context.data?.stage!=='ready')return null
 if(!icon)return <Button className='message-entry text-button' ariaLabel={`消息中心${unread.data?.count ? `，${unread.data.count} 条未读` : ''}`} onClick={()=>void navigate('/packages/account/messages/index')}>消息{unread.data?.count?` · ${unread.data.count}`:''}</Button>
 const button=<Button className='message-entry icon-button' ariaLabel={`消息中心${unread.data?.count ? `，${unread.data.count} 条未读` : ''}`} onClick={() => void navigate('/packages/account/messages/index')}><Icon name='bell' />{!!unread.data?.count && <Text className='unread-badge'>{unread.data.count>99?'99+':unread.data.count}</Text>}</Button>
 return subscription ? <View className='home-header-actions'><SubscriptionEntry enabled={visible}/>{button}</View> : button
}
