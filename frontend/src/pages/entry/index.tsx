import { useState } from 'react'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { session } from '../../core/api'
import { getContext, login as loginIdentity } from '../../features/identity/api'
import { queries } from '../../core/query'
import { clearMedia } from '../../core/media'
import { clearCheckoutPrice } from '../../features/orders/checkout-intent'
import { routeContext } from '../../app/hooks'
import { platformLogin, storage } from '../../platform'
import { Page } from '../../app/page'
import { useAction } from '../../core/use-action'
import { ErrorState } from '../../ui'
import { milestoneRosette as rosette } from '../../ui/artwork'

export default function Entry() {
  const action = useAction()
  const [identity, setIdentity] = useState('')
  async function enter() { await routeContext(await getContext()) }
  useDidShow(() => { if (session()) void action.run(enter) })
  async function login(dev = false) {
    const body = dev ? { devIdentity: identity } : { code: (await platformLogin()).code }
    const result = await loginIdentity(body)
    queries.clear(); clearMedia(); clearCheckoutPrice(); storage.write('session', result)
    await enter()
  }
  return <Page title='把日常，留给彼此' subtitle='两个人的小店，从一起开始。'>
    <View className='welcome-hero'><Image src={rosette} mode='aspectFit'/><Text className='page-title'>把日常，留给彼此</Text><Text className='muted'>两个人的小店，从一起开始。</Text></View>
    <View className='surface intro'><Text className='section-title'>欢迎来到情侣小店</Text><Text className='muted'>邀请伴侣、共同约定规则，再用签到与任务积攒两个人的小确幸。这里的积分永远不涉及真实金钱。</Text>
      <Button className='button' loading={action.busy} disabled={action.busy} onClick={() => void action.run(() => session() ? enter() : login())}>{session() ? '继续进入' : '微信登录'}</Button>
    </View>
    {DEV_LOGIN && <View className='surface form'><Text className='section-title'>本地开发登录</Text><Text className='muted'>输入稳定的测试身份；两个设备请使用不同身份。</Text><Input className='input' ariaLabel='开发身份' value={identity} placeholder='例如 alice 或 bob' onInput={e => setIdentity(e.detail.value)} maxlength={40} /><Button className='button secondary' disabled={action.busy || !identity.trim()} onClick={() => void action.run(() => login(true))}>使用开发身份登录</Button></View>}
    <ErrorState error={action.error} />
  </Page>
}
