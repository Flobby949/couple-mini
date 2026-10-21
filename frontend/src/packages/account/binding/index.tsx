import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Text, View } from '@tarojs/components'
import { useEffect } from 'react'
import { session } from '../../../core/api'
import { useVisible, routeContext } from '../../../app/hooks'
import { keys } from '../../../core/query'
import { getContext, invitePartner, bindPartner } from '../../../features/identity/api'
import { copy, redirect } from '../../../platform'
import { Page } from '../../../app/page'
import { useAction } from '../../../core/use-action'
import { ErrorState } from '../../../ui'

export default function Binding() {
  const visible = useVisible(), action = useAction()
  const [code, setCode] = useState(''), [invitation, setInvitation] = useState<{ code: string; expiresAt: string }>()
  const context = useQuery({ queryKey: keys.context, queryFn: getContext, enabled: visible && !!session(), refetchInterval: visible ? 5000 : false })
  useEffect(() => { if (!visible) return; if (!session()) void redirect('/pages/entry/index'); else if (context.data && context.data.stage !== 'binding') void routeContext(context.data) }, [visible, context.data?.stage])
  return <Page title='让日常，有个伴' subtitle='用一个邀请码，连接两个人的小店。'>
    <View className='surface form'><Text className='section-title'>邀请另一半</Text><Text className='muted'>邀请码 24 小时内有效，只能使用一次。第一版绑定后不能解绑或换绑。</Text>{invitation && <><Text className='invite-code' selectable>{invitation.code}</Text><Button className='button secondary' onClick={() => void copy(invitation.code)}>复制邀请码</Button></>}<Button className='button' disabled={action.busy} loading={action.busy} onClick={() => void action.run(() => invitePartner(), setInvitation)}>生成邀请码</Button></View>
    <View className='surface form'><Text className='section-title'>我收到了邀请码</Text><Input className='input' ariaLabel='伴侣邀请码' value={code} placeholder='输入另一半的邀请码' maxlength={12} onInput={e => setCode(e.detail.value.trim())} /><Text className='muted'>确认前请向对方核实邀请码。绑定后双方仍需确认共同规则。</Text><Button className='button secondary' disabled={action.busy || code.length !== 12} onClick={() => void action.run(() => bindPartner(code))}>确认绑定伴侣</Button></View>
    <ErrorState error={action.error || context.error} retry={() => void context.refetch()} />
  </Page>
}
