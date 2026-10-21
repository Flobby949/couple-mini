import { Button, Text, View } from '@tarojs/components'
import { useGate } from '../../app/hooks'
import { queries } from '../../core/query'
import { navigate, redirect, storage } from '../../platform'
import { Page } from '../../app/page'
import { ErrorState, Loading } from '../../ui'

export default function Me() {
  const gate = useGate()
  return <Page title='我的日常' subtitle='两个人各自经营，也一起约定。'><ErrorState error={gate.error} retry={() => void gate.refetch()} />{!gate.allowed ? <Loading /> : <>
    <View className='surface profile'><View className='profile-avatar'>{gate.data!.me.nickname.slice(0, 1)}</View><Text className='section-title'>{gate.data!.me.nickname}</Text><Text className='muted'>伴侣：{gate.data!.partner!.nickname}</Text></View>
    <View className='surface menu'><Button onClick={() => void navigate('/packages/account/rules/index')}>伴侣与共同规则 <Text>›</Text></Button><Button onClick={() => void navigate('/packages/account/history/index')}>共同积分池明细 <Text>›</Text></Button><Button onClick={() => void navigate('/packages/account/appearance/index')}>外观与主题色 <Text>›</Text></Button></View>
    <View className='fixed-rules'><Text>个人积分初始为 0，签到全部进入共同积分池。永久不涉及真实金钱。</Text></View>
    <Button className='button secondary' onClick={() => { storage.remove('session'); queries.clear(); void redirect('/pages/entry/index') }}>退出当前登录</Button>
  </>}</Page>
}
