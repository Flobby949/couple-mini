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
import { navigate } from '../../../platform'
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
    {!data && !query.error ? <Loading /> : data && <>
      <View className='surface'><ProductSummary product={data.product} stock={data.product.stock} /><Text className='description'>{data.product.description}</Text></View>
      {changed && <Notice><Text className='section-title'>价格已更新，请重新确认</Text><Text>{originalPrice} 积分 → {data.product.price} 积分</Text></Notice>}
      <View className='surface checkout-lines'><View><Text>兑换数量</Text><Text>1 份</Text></View><View><Text>本次扣除</Text><Text className='price'>{data.product.price} 积分</Text></View><View><Text>当前余额</Text><Text>{data.balance} 积分</Text></View><View><Text>下单后余额</Text><Text>{blocked ? '当前不可下单' : `${data.balance - data.product.price} 积分`}</Text></View></View>
      <Text className='muted'>下单即扣积分与一份库存，等待店主接单。消费积分退出系统，不转入对方余额或积分池。</Text>
      {blocked && <Notice>{blocked}</Notice>}
      <Button className='button checkout-button' loading={action.busy} disabled={!!blocked || action.busy || !!pending()} onClick={submit}>{changed ? '确认以新价' : '确认以'} {data.product.price} 积分下单</Button>
    </>}
  </Page>
}
