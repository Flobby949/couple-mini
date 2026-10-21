import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Text, View } from '@tarojs/components'
import { session } from '../../../core/api'
import { useVisible, routeContext } from '../../../app/hooks'
import { keys } from '../../../core/query'
import { getContext, invitePartner, bindPartner } from '../../../features/identity/api'
import { copy, redirect } from '../../../platform'
import { Page } from '../../../app/page'
import { useAction } from '../../../core/use-action'
import { ErrorState } from '../../../ui'
import { ConnectedPair, Icon, InlineInfo } from '../../../ui/visual'

export default function Binding() {
  const visible = useVisible(), action = useAction()
  const [code, setCode] = useState(''), [invitation, setInvitation] = useState<{ code: string; expiresAt: string }>(), [joining,setJoining]=useState(false)
  const context = useQuery({ queryKey: keys.context, queryFn: getContext, enabled: visible && !!session(), refetchInterval: visible ? 5000 : false })
  useEffect(() => { if (!visible) return; if (!session()) void redirect('/pages/entry/index'); else if (context.data && context.data.stage !== 'binding') void routeContext(context.data) }, [visible, context.data?.stage])
  return <Page title='让日常，有个伴' navTitle={joining?'输入邀请码':'邀请伴侣'} onBack={joining?()=>setJoining(false):undefined}>
    <View className='onboarding-heading'><Text className='page-title'>{joining?'连接彼此的小世界':'两个人的小店，从这里开始'}</Text><Text className='muted'>{joining?'输入另一半分享给你的邀请码':'邀请你的另一半，把平凡的日常变得特别'}</Text></View>
    {context.data && <ConnectedPair me={context.data.me}/>}
    {joining?<View className='surface form invitation-card'><Text className='section-title'>输入伴侣的邀请码</Text><Input className='input invite-input' ariaLabel='伴侣邀请码' value={code} placeholder='12 位邀请码' maxlength={12} onInput={e => setCode(e.detail.value.trim())}/><Text className='muted'>确认前请向对方核实邀请码，绑定后双方还需确认共同规则。</Text><Button className='button' disabled={action.busy||code.length!==12} loading={action.busy} onClick={()=>void action.run(()=>bindPartner(code))}>确认绑定</Button><Button className='text-button' disabled={action.busy} onClick={()=>setJoining(false)}>返回邀请页</Button></View>:<>
      <View className='surface form invitation-card'><Text className='section-title'>我的邀请码</Text>{invitation?<><Text className='invite-code' selectable>{invitation.code}</Text><Text className='muted'>24 小时内有效 · 仅可使用一次</Text><Button className='button' onClick={()=>void copy(invitation.code)}><Icon name='copy' size={18}/>复制邀请码</Button></>:<><Text className='muted'>生成专属邀请码，分享给另一半</Text><Button className='button' disabled={action.busy} loading={action.busy} onClick={()=>void action.run(invitePartner,setInvitation)}>生成邀请码</Button></>}</View>
      <Button className='text-button invitation-switch' onClick={()=>setJoining(true)}>我有邀请码，去绑定 <Icon name='chevron' tone='primary' size={16}/></Button>
    </>}
    <InlineInfo>绑定后，你们将拥有共同积分池与各自的小店。当前版本不支持解绑或换绑，请确认彼此后再绑定。</InlineInfo>
    <ErrorState error={action.error||context.error} retry={()=>void context.refetch()}/>
  </Page>
}
