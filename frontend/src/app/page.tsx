import { useEffect, type PropsWithChildren } from 'react'
import { Text, View } from '@tarojs/components'
import { useDidShow, useRouter } from '@tarojs/taro'
import { MessageEntry } from '../features/notifications/entry'
import { Recovery } from './recovery'
import { useTheme } from './theme'
import { applyNativeTheme } from '../platform/theme'
import { setPageTitle, topInset } from '../platform'

export function Page({ title, subtitle, children, messageEntry = false }: PropsWithChildren<{title:string;subtitle?:string;messageEntry?:boolean}>) {
 const {scheme,appearance}=useTheme(),route=useRouter(),key=route.path.split('?')[0].split('/').slice(-2)[0]
 const pilot=key==='home'||key==='me',pageTitle=key==='me'?'我的':title
 const apply=()=>{applyNativeTheme(scheme,appearance.accent);if(pilot)void setPageTitle(pageTitle)}
 useEffect(apply,[scheme,appearance.accent,pageTitle]);useDidShow(apply)
 return <View className={`theme-root theme-${scheme} accent-${appearance.accent} ${pilot?`ui-v2 route-${key}`:''}`}><View className='page' style={pilot&&process.env.TARO_ENV==='weapp'?{paddingTop:`${topInset()+44}px`}:undefined}>
  {pilot?<View className='page-heading'>{key==='home'&&<Text className='home-eyebrow'>我们的日常</Text>}<Text className='page-title'>{pageTitle}</Text>{subtitle&&key==='home'&&<Text className='page-subtitle'>{subtitle}</Text>}{messageEntry&&<MessageEntry icon/>}</View>:<>{messageEntry&&<MessageEntry/>}<View className='page-heading'><Text className='page-title'>{title}</Text>{subtitle&&<Text className='muted'>{subtitle}</Text>}</View></>}
  <Recovery/>{children}
 </View></View>
}
