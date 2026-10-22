import { useState } from 'react'
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
import { Avatar, BalanceTiles, Icon, MenuRow } from '../../ui/visual'
import type { IconName } from '../../ui/icons'

export default function Me() {
 const gate=useGate(),[role,setRole]=useState<'buyer'|'seller'>('buyer')
 const summary=useQuery({queryKey:keys.home,queryFn:getHome,enabled:gate.allowed,refetchInterval:gate.allowed?30000:false})
 const state=gate.data
 return <Page messageEntry title='我的'><ErrorState error={gate.error||summary.error} retry={()=>{void gate.refetch();void summary.refetch()}}/>{!gate.allowed?<Loading/>:<>
  <View className='surface profile-pair'>{[state!.me,state!.partner!].map((user,index)=><Button className='profile-row' key={user.id} onClick={()=>void navigate(index===0?'/packages/account/profile/index':'/packages/account/partner/index')}><Avatar user={user} partnerId={index===0?state!.partner!.id:state!.me.id} size={62}/><View className='profile-copy'><Text className='section-title'>{user.nickname}</Text><Text className='muted'>{index===0?'编辑我的头像和昵称':'我们在一起好好生活。'}</Text></View><Icon name='chevron' tone='primary' size={17}/></Button>)}</View>
  {summary.data&&<BalanceTiles balance={summary.data.points.balance} earned={summary.data.points.earned} limit={summary.data.points.dailyLimit} remaining={summary.data.points.remaining}/>}
  <View className='surface order-shortcuts'><View className='row'><Text className='section-title'>我的订单</Text><View className='segmented'>{(['buyer','seller'] as const).map(r=><Button key={r} className={`segment-option ${role===r?'selected':''}`} onClick={()=>setRole(r)}>{r==='buyer'?'我下的单':'我收到的'}</Button>)}</View></View><View className='shortcut-grid'>{([{label:'待接单',status:'pending',icon:'order'},{label:'待兑现',status:'fulfilling',icon:'clock'},{label:'待确认',status:'awaiting_receipt',icon:'task'},{label:'全部',status:'',icon:'order'}] as {label:string;status:string;icon:IconName}[]).map(f=><Button className='shortcut-item' key={f.label} onClick={()=>void navigate(`/packages/commerce/orders/index?role=${role}&status=${f.status}`)}><Icon name={f.icon} size={25}/><Text>{f.label}</Text></Button>)}</View></View>
  <View className='surface menu'><MenuRow icon='shop' title='我的小店' description='管理商品，打造属于我们的小店' onClick={()=>void navigate('/packages/commerce/store/index')}/><MenuRow icon='coins' title='积分明细' description='查看积分收支记录' onClick={()=>void navigate('/packages/account/points/index')}/><MenuRow icon='settings' title='伴侣设置' description='查看与管理我们的相关设置' onClick={()=>void navigate('/packages/account/partner/index')}/><MenuRow icon='order' title='共同规则' description='一起制定让我们舒服的约定' onClick={()=>void navigate('/packages/account/rules/index')}/><MenuRow icon='bell' title='消息通知' description='接收任务、订单等重要提醒' onClick={()=>void navigate('/packages/account/notification-settings/index')}/></View>
  <Text className='brand-footer'>——  我们的两人小店  ——</Text>
  <View className='surface menu'><MenuRow icon='star' title='外观与主题色' onClick={()=>void navigate('/packages/account/appearance/index')}/><MenuRow icon='wallet' title='共同积分池' onClick={()=>void navigate('/packages/account/history/index')}/></View>
  <Button className='text-button' onClick={()=>{storage.remove('session');queries.clear();clearMedia();clearCheckoutPrice();void redirect('/pages/entry/index')}}>退出当前登录</Button>
 </>}</Page>
}
