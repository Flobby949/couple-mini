import { Button, Text, View } from '@tarojs/components'
import { useQuery } from '@tanstack/react-query'
import { useGate } from '../../app/hooks'
import { keys, queries } from '../../core/query'
import { getHome } from '../../features/home/api'
import { clearMedia } from '../../core/media'
import { clearCheckoutPrice } from '../../features/orders/checkout-intent'
import { navigate, redirect, storage } from '../../platform'
import { Page } from '../../app/page'
import { ErrorState, Loading } from '../../ui'

export default function Me() {
  const gate = useGate()
  const summary = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  return <Page messageEntry title='我的日常' subtitle='两个人各自经营，也一起约定。'><ErrorState error={gate.error || summary.error} retry={() => { void gate.refetch(); void summary.refetch() }} />{!gate.allowed ? <Loading /> : <>
    <View className='surface profile'><View className='profile-avatar'>{gate.data!.me.nickname.slice(0, 1)}</View><Text className='section-title'>{gate.data!.me.nickname}</Text><Text className='muted'>伴侣：{gate.data!.partner!.nickname}</Text></View>
    {summary.data && <View className='surface'><Text className='section-title'>我的积分 {summary.data.points.balance}</Text><Text className='muted'>今日已获得 {summary.data.points.earned} / {summary.data.points.dailyLimit} · 剩余 {summary.data.points.remaining}</Text></View>}
    <View className='surface menu'><Button className='menu-item' onClick={() => void navigate('/packages/account/messages/index')}>消息中心 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/account/notification-settings/index')}>提醒偏好 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/commerce/orders/index')}>我的订单 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/commerce/store/index')}>我的小店 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/account/points/index')}>个人积分明细 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/account/partner/index')}>伴侣设置 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/account/history/index')}>共同积分池明细 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/account/appearance/index')}>外观与主题色 <Text>›</Text></Button></View>
    <View className='fixed-rules'><Text>个人积分初始为 0，签到全部进入共同积分池。永久不涉及真实金钱。</Text></View>
    <Button className='button secondary' onClick={() => { storage.remove('session'); queries.clear(); clearMedia(); clearCheckoutPrice(); void redirect('/pages/entry/index') }}>退出当前登录</Button>
  </>}</Page>
}
