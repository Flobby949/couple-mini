import { useArtwork } from '../../../ui/use-artwork'
import { useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getGift } from '../../../features/points/gifts'
import { keys } from '../../../core/query'
import { beijingTimeSeconds } from '../../../core/values'
import { navigate, switchTab } from '../../../platform'
import { ErrorState, Loading, Notice } from '../../../ui'

export default function GiftDetail() {
 const { milestoneRosette: rosette } = useArtwork()
  const gate = useGate(), id = useRouter().params.id || ''
  const query = useQuery({ queryKey: keys.gift(id), queryFn: () => getGift(id), enabled: gate.allowed && !!id, staleTime: 0 })
  const gift = gate.allowed ? query.data : undefined
  return <Page title='每份鼓励，都有回应' subtitle='以下是这笔赠送已经确定的实际结果。'>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!id ? <Notice>赠送入口缺少标识，请返回赠送记录。</Notice> : !gift && !query.error && !gate.error ? <Loading /> : gift && <><View className='result-hero'><Image src={rosette} mode='aspectFit'/><Text className='page-title'>这份心意，已送达</Text><Text className='muted'>每一份鼓励，都有回应</Text></View><View className='surface form'><Text className='tag'>{gift.senderId === gate.data!.me.id ? '我送给伴侣' : '伴侣送给我'}</Text><Text className='section-title'>实际到账 {gift.actual} 积分</Text><View className='checkout-lines'><View><Text>申请赠送</Text><Text>{gift.requested} 积分</Text></View><View><Text>实际到账</Text><Text>{gift.actual} 积分</Text></View><View><Text>未发放</Text><Text>{gift.discarded} 积分</Text></View></View><Text className='muted'>{beijingTimeSeconds(gift.createdAt)} 北京时间</Text><Text className='muted'>{gift.requested === 0 ? '这次主动赠送 0 分，已正常保留记录并计入一次赠送。' : '未发放部分直接消失，不入池、不保留以后领取。'}不扣赠送方余额或共同池。</Text></View><Button className='button secondary' onClick={() => void navigate('/packages/account/gift/index')}>查看赠送记录</Button><Button className='text-button' onClick={() => void switchTab('/pages/me/index')}>返回我的</Button></>}
  </Page>
}
