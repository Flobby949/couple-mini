import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getGiftPreview, getGifts, sendGift } from '../../../features/points/gifts'
import { keys } from '../../../core/query'
import { useAction } from '../../../core/use-action'
import { parsePoints, beijingTime } from '../../../core/values'
import { pending } from '../../../core/operations'
import { navigate } from '../../../platform'
import { Empty, ErrorState, Loading, Notice } from '../../../ui'

export default function GiftPage() {
  const gate = useGate(), action = useAction(), [amount, setAmount] = useState('')
  const query = useQuery({ queryKey: keys.giftPreview, queryFn: getGiftPreview, enabled: gate.allowed, staleTime: 0, refetchInterval: gate.allowed ? 15000 : false })
  const history = useQuery({ queryKey: keys.gifts, queryFn: getGifts, enabled: gate.allowed, staleTime: 0, refetchInterval: gate.allowed ? 30000 : false })
  const value = parsePoints(amount), preview = query.data
  const actual = preview && value !== null ? Math.min(value,preview.receiverRemaining) : undefined
  const valid = value !== null && !!preview && value <= preview.singleMax && preview.sendsRemaining > 0
  function submit() { if (gate.allowed && valid) void action.run(() => sendGift(amount), async result => { setAmount(''); await navigate(`/packages/account/gift-detail/index?id=${result.id}`) }) }
  return <Page title='送一份小小的鼓励' subtitle='这不是转账，积分由系统新增。'>
    <ErrorState error={gate.error || query.error || history.error || action.error} retry={() => { void gate.refetch(); void query.refetch(); void history.refetch() }} />
    {!gate.allowed || !preview ? <Loading /> : <>
      <View className='surface form'><Text className='section-title'>送给{gate.data!.partner!.nickname}</Text><Text className='field-label'>申请赠送积分</Text><Input className='input' ariaLabel='申请赠送积分' type='digit' value={amount} placeholder='允许明确输入 0' onInput={e => setAmount(e.detail.value)} /><Text className='muted'>本次最多 {preview.singleMax} 积分 · 今日还可赠送 {preview.sendsRemaining} 次</Text><Text className='muted'>对方今日剩余额度 {preview.receiverRemaining} 积分</Text>
        {value !== null && value > preview.singleMax && <Text className='warning-text'>申请数额超过单次上限，请降低金额或刷新规则。</Text>}
        {preview.sendsRemaining === 0 && <Notice>今天的 3 次赠送已用完。</Notice>}
        {actual !== undefined && <View className='budget-preview'><Text className='section-title'>预计到账 {actual} 积分</Text><Text>另 {value! - actual} 积分不发放、不入池、不补发。</Text></View>}
        <Text className='muted'>不扣你的余额或共同积分池。每笔成功赠送都计一次，包括主动赠送 0 分和实际到账为 0。</Text>
        <Button className='button' loading={action.busy} disabled={!valid || action.busy || !!pending()} onClick={submit}>确认赠送 {value ?? '…'} 积分</Button>
      </View>
      <Text className='section-title section-heading'>最近 100 笔赠送记录</Text>{history.data?.items.length === 0 && <Empty title='第一份鼓励，还没送出' description='双方的每次赠送都会在这里保留实际结果。' />}
      {history.data?.items.map(gift => <View className='ledger-row' key={gift.id}><View><Text className='section-title'>{gift.senderId === gate.data!.me.id ? '我送给伴侣' : '伴侣送给我'}</Text><Text className='muted'>{beijingTime(gift.createdAt)} 北京时间</Text><Button className='text-button' onClick={() => void navigate(`/packages/account/gift-detail/index?id=${gift.id}`)}>查看这次赠送</Button></View><View><Text className='price'>实际 {gift.actual} 积分</Text><Text className='muted'>申请 {gift.requested}，未发放 {gift.discarded}</Text></View></View>)}
    </>}
  </Page>
}
