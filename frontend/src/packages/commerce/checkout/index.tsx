import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getProduct } from '../../../features/catalog/api'
import { ProductSummary } from '../../../features/catalog/components'
import { placeOrder } from '../../../features/orders/api'
import { purchaseBlock } from '../../../features/orders/presentation'
import { checkoutPrice, clearCheckoutPrice } from '../../../features/orders/checkout-intent'
import { keys } from '../../../core/query'
import { useAction } from '../../../core/use-action'
import { pending } from '../../../core/operations'
import { back, navigate } from '../../../platform'
import { Avatar, Icon, InlineInfo } from '../../../ui/visual'
import { ErrorState, Loading, Notice } from '../../../ui'

export default function Checkout() {
  const gate = useGate(), id = useRouter().params.id || '', action = useAction()
  const [originalPrice, setOriginalPrice] = useState<number | undefined>(() => checkoutPrice(id))
  const query = useQuery({ queryKey: keys.product(id), queryFn: () => getProduct(id), enabled: gate.allowed && !!id, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  const data = gate.allowed ? query.data : undefined
  useEffect(() => { if (data && originalPrice === undefined) setOriginalPrice(data.product.price) }, [data, originalPrice])
  useEffect(() => () => clearCheckoutPrice(id), [id])
  const changed = data && originalPrice !== undefined && data.product.price !== originalPrice
  const blocked = data ? data.product.ownerId === gate.data?.me.id ? '只能在伴侣的小店下单' : purchaseBlock(data.balance, data.product.stock, data.product.price) : ''
  function submit() { if (data) void action.run(() => placeOrder(id, data.product.price), async result => { await navigate(`/packages/commerce/order-detail/index?id=${result.orderId}`) }) }
  return <Page title='确认这一份心意' subtitle='一次一个商品，固定兑换一份。'>
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!id ? <Notice>下单入口缺少标识，请返回后重新打开。</Notice> : !data && !query.error && !gate.error ? <Loading /> : data && <>
      <View className='surface checkout-product'><ProductSummary product={data.product} stock={data.product.stock}/><View className='checkout-owner'><Avatar user={gate.data!.partner!} partnerId={gate.data!.me.id} size={42}/><Text className='muted'>{gate.data!.partner!.nickname}</Text></View></View>
      {changed&&<Notice><Text className='section-title'>价格已更新</Text><Text className='price-change'><Text className='old-price'>{originalPrice} 积分</Text><Text> → </Text><Text className='danger-text'>{data.product.price} 积分</Text></Text><Text>请确认新价格后再下单</Text></Notice>}
      <View className='surface checkout-lines'><View><Icon name='gift' tone='primary'/><Text>兑换数量</Text><Text>1 份</Text></View><View><Icon name='coins' tone='primary'/><Text>本次扣除</Text><Text className='danger-text'>{data.product.price} 积分</Text></View><View><Icon name='star' tone='primary'/><Text>当前余额</Text><Text>{data.balance} 积分</Text></View><View><Icon name='wallet' tone='primary'/><Text>下单后余额</Text><Text>{blocked?'当前不可下单':`${data.balance-data.product.price} 积分`}</Text></View></View>
      <InlineInfo>下单即扣积分与一份库存，等待店主接单。消费积分退出系统。</InlineInfo>
      {blocked && <Notice>{blocked}</Notice>}
      <View className='actions checkout-actions'><Button className='button secondary' disabled={action.busy} onClick={()=>void back('/pages/shop/index')}>暂不下单</Button><Button className='button' loading={action.busy} disabled={!!blocked || action.busy || !!pending()} onClick={submit}>{changed ? '确认以新价' : '确认以'} {data.product.price} 积分下单</Button></View>
    </>}
  </Page>
}
