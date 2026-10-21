import { type PropsWithChildren } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTheme } from '../app/theme'
import { navigate } from '../platform'
import type { IconName } from './icons'
import { avatarWoman as woman } from './artwork'
import { avatarMan as man } from './artwork'
import { avatarFrame as frame } from './artwork'
import { pointsJar as jar } from './artwork'

export function Icon({ name, tone = 'ink', size = 24 }: {name: IconName; tone?: 'ink'|'muted'|'primary'; size?: number}) {
  const { scheme, appearance } = useTheme()
  return <Image className='ui-icon' src={`/assets/ui-icons/${name}-${tone === 'primary' ? appearance.accent : tone}-${scheme}.png`} style={{width:Taro.pxTransform(size),height:Taro.pxTransform(size)}} mode='aspectFit' ariaHidden />
}
export function Avatar({ user, partnerId, size = 52, stitched = false, checked }: {user: {id: string; nickname: string}; partnerId: string; size?: number; stitched?: boolean; checked?: boolean}) {
  const first = user.id < partnerId
  return <View className={`portrait ${stitched ? 'portrait-stitched' : ''} ${!first ? 'portrait-blue' : ''}`} style={{width:Taro.pxTransform(size),height:Taro.pxTransform(size)}}>
    <View className='portrait-crop'><Image className='portrait-art' src={first ? woman : man} mode='aspectFill' ariaLabel={`${user.nickname}的默认插画头像`} /></View>
    {stitched && <Image className='portrait-frame' src={frame} mode='aspectFit' ariaHidden />}
    {checked !== undefined && <View className={`portrait-state ${checked ? 'is-checked' : ''}`}>{checked && <Text>✓</Text>}</View>}
  </View>
}
export function MenuRow({ icon, title, description, onClick }: {icon:IconName;title:string;description?:string;onClick:()=>void}) {
 return <Button className='menu-item' onClick={onClick}><Icon name={icon} /><View className='menu-copy'><Text className='menu-title'>{title}</Text>{description && <Text className='muted'>{description}</Text>}</View><Icon name='chevron' size={17} tone='muted' /></Button>
}
export function PoolCard({ total,available,reserved }: {total:number;available:number;reserved:number}) {
 return <Button className='surface pool-card' onClick={() => void navigate('/packages/account/history/index')}><Image src={jar} className='pool-jar' mode='aspectFit' /><View className='pool-copy'><Text className='section-title'>共同积分池</Text><Text><Text className='number'>{total}</Text> 积分</Text><Text className='muted'>可用 <Text className='primary-text'>{available}</Text> · 已预留 {reserved}</Text></View><Icon name='chevron' size={17} tone='primary' /></Button>
}
export function BalanceTiles({ balance, earned, limit, remaining }: {balance:number;earned:number;limit:number;remaining:number}) {
 const percent = limit > 0 ? Math.min(100,earned/limit*100) : 0
 return <View className='balance-tiles'><Button className='balance-tile' onClick={() => void navigate('/packages/account/points/index')}><View className='tile-title'><View className='coin-star'>★</View><Text>我的积分</Text></View><View className='tile-value'><Text><Text className='metric'>{balance}</Text> 积分</Text><Icon name='chevron' size={16} tone='muted' /></View></Button><View className='balance-tile'><View className='tile-title'><Icon name='star' size={14} tone='muted' /><Text>今日已得</Text></View><View className='earned-summary'><View className='quota-ring' style={{background:`conic-gradient(var(--primary) ${percent}%, var(--line) 0)`}}><View /></View><View><Text><Text className='earned-value'>{earned}</Text> / {limit}</Text><Text className='muted'>剩余 {remaining}</Text></View></View></View></View>
}
export function Section({ title, children }: PropsWithChildren<{title:string}>) {return <View className='section'><View className='row section-head'><Text className='section-title'>{title}</Text></View>{children}</View>}
export function InlineInfo({children}:{children:React.ReactNode}) {return <View className='inline-info'><Icon name='info' tone='primary' size={18}/><View>{children}</View></View>}
export function PersonRow({user,partnerId,title,description}:{user:{id:string;nickname:string};partnerId:string;title?:string;description?:string}) {return <View className='person-row'><Avatar user={user} partnerId={partnerId} size={52}/><View><Text className='section-title'>{title||user.nickname}</Text>{description&&<Text className='muted'>{description}</Text>}</View></View>}
export function BudgetCard({children}:{children:React.ReactNode}){return <View className='budget-preview'><Image className='budget-jar' src={jar} mode='aspectFit' ariaHidden/><View className='budget-copy'>{children}</View></View>}
export function ConnectedPair({me,partner}:{me:{id:string;nickname:string};partner?:{id:string;nickname:string}}) {
 const {scheme,appearance}=useTheme()
 return <View className='connected-pair'><View><Avatar user={me} partnerId={partner?.id||'~'} size={106} stitched/><Text>{me.nickname}</Text></View><Image className='connected-thread' src={`/assets/ui-icons/checkin-connection-${appearance.accent}-${scheme}.png`} mode='aspectFit' ariaHidden/><View>{partner?<Avatar user={partner} partnerId={me.id} size={106} stitched/>:<View className='unknown-portrait'><Icon name='user' tone='muted' size={48}/></View>}<Text>{partner?.nickname||'等待另一半'}</Text></View></View>
}
