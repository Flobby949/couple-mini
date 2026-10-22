import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getMessage, readMessages } from '../../../features/notifications/api'
import { deliveryNames, deliveryReasons, targetRoute } from '../../../features/notifications/presentation'
import { keys } from '../../../core/query'
import { pending } from '../../../core/operations'
import { useAction } from '../../../core/use-action'
import { beijingTimeSeconds } from '../../../core/values'
import { returnTo } from '../../../platform'
import { openTarget } from '../../../app/navigation'
import { ErrorState, Loading, Notice } from '../../../ui'
import { Icon } from '../../../ui/visual'

export default function MessageDetailPage() {
  const gate = useGate(), id = useRouter().params.id || '', action = useAction(), marked = useRef('')
  const query = useQuery({ queryKey: keys.message(id), queryFn: () => getMessage(id), enabled: gate.allowed && !!id, staleTime: 0 })
  const message = gate.canShow ? query.data : undefined
  useEffect(() => { if (gate.allowed && message && !message.readAt && marked.current !== message.id && !pending()) { marked.current = message.id; void action.run(() => readMessages([message.id])) } }, [message?.id, message?.readAt, gate.allowed])
  return <Page title={message?.title || '这一次的回应'} subtitle='正文保留事情发生时的结果，业务详情展示当前状态。'>
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch(); if (gate.allowed && message && !message.readAt && !pending()) void action.run(() => readMessages([id])) }} />
    {!id ? <Notice>消息入口缺少标识，请返回消息中心。</Notice> : !message && !query.error && <Loading />}
    {message && <><View className='surface message-detail'><View className='detail-message-title'><Icon name='bell' tone='primary'/><Text className='section-title'>{message.title}</Text></View><Text className='message-body'>{message.body}</Text><Text className='muted'>发生于 {beijingTimeSeconds(message.occurredAt)} 北京时间</Text><Text className='muted'>收到于 {beijingTimeSeconds(message.receivedAt)} 北京时间</Text></View>
      {message.deliveryStatus && <Notice><Text>微信：{deliveryNames[message.deliveryStatus] || '状态待核查'}</Text>{message.deliveryReason && <Text>{deliveryReasons[message.deliveryReason] || '请在提醒偏好中查看投递记录'}</Text>}</Notice>}
      {targetRoute(message.target) ? <Button className='button' onClick={() => void openTarget(message.target)}>查看当前事项</Button> : <Notice>这个消息入口暂不可用，可以返回消息中心。</Notice>}
    </>}
    <Button className='text-button' onClick={() => void returnTo('/packages/account/messages/index')}>返回消息中心</Button>
  </Page>
}
