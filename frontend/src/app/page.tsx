import { useEffect, type PropsWithChildren } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { MessageEntry } from '../features/notifications/entry'
import { Recovery } from './recovery'
import { useTheme } from './theme'
import { applyNativeTheme } from '../platform/theme'
import { back, setPageTitle, topInset } from '../platform'
import { Icon } from '../ui/visual'
import { useVisible } from './hooks'

const titles:Record<string,string>={binding:'邀请伴侣',rules:'共同规则',history:'共同积分池',points:'积分明细',partner:'伴侣设置',gift:'赠送积分','gift-detail':'赠送结果',messages:'消息中心','message-detail':'消息详情','notification-settings':'消息通知','notification-template':'接收方式',appearance:'外观与主题色',store:'我的小店','product-edit':'编辑商品',product:'商品详情',checkout:'确认下单',orders:'我的订单','order-detail':'订单详情',edit:'新建任务',detail:'任务详情',milestones:'累计双人签到'}
const fallback:Record<string,string>={detail:'/pages/tasks/index',edit:'/pages/tasks/index',product:'/pages/shop/index',checkout:'/pages/shop/index','message-detail':'/packages/account/messages/index','notification-template':'/packages/account/notification-settings/index'}
export function Page({title,subtitle,children,messageEntry=false,navTitle,onBack}:PropsWithChildren<{title:string;subtitle?:string;messageEntry?:boolean;navTitle?:string;onBack?:()=>void}>){
 const {scheme,appearance}=useTheme(),visible=useVisible(),route=useRouter(),key=route.path.split('?')[0].split('/').slice(-2)[0]
 const pageTitle=navTitle||(messageEntry?(key==='me'?'我的':key==='tasks'?'任务':title):key==='edit'&&route.params.id?'编辑任务':key==='product-edit'&&!route.params.id?'新建商品':titles[key]||title)
 const apply=()=>{applyNativeTheme(scheme,appearance.accent);void setPageTitle(pageTitle)}
 useEffect(()=>{if(visible)apply()},[visible,scheme,appearance.accent,pageTitle])
 useDidShow(()=>{if(messageEntry)void Taro.showTabBar({animation:false}).catch(()=>{})})
 return <View className={`theme-root theme-${scheme} accent-${appearance.accent} ui-v2 route-${key} ${messageEntry?'main-page':'detail-page'}`}><View className='page' style={messageEntry&&process.env.TARO_ENV==='weapp'?{paddingTop:`${topInset()+44}px`}:undefined}>
  {messageEntry?<View className='page-heading'>{key==='home'&&<Text className='home-eyebrow'>我们的日常</Text>}<Text className='page-title'>{pageTitle}</Text>{subtitle&&key!=='me'&&key!=='tasks'&&<Text className='page-subtitle'>{subtitle}</Text>}<MessageEntry icon/></View>:process.env.TARO_ENV==='h5'&&key!=='entry'&&<View className='page-nav'><Button className='icon-button' ariaLabel='返回上一页' onClick={()=>{if(onBack)onBack();else void back(fallback[key])}}><Icon name='back'/></Button><Text>{pageTitle}</Text><View className='nav-spacer'/></View>}
  <Recovery/>{children}
 </View></View>
}
