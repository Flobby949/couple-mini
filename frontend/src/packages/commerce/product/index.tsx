import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { addCart, getProduct } from '../../../features/catalog/api'
import { Cover } from '../../../features/catalog/components'
import { purchaseBlock } from '../../../features/orders/presentation'
import { rememberCheckoutPrice } from '../../../features/orders/checkout-intent'
import { keys } from '../../../core/query'
import { useAction } from '../../../core/use-action'
import { navigate } from '../../../platform'
import { ErrorState, Loading, Notice } from '../../../ui'

export default function ProductPage() {
  const gate = useGate(), id = useRouter().params.id || '', action = useAction(), [added, setAdded] = useState(false)
  const query = useQuery({ queryKey: keys.product(id), queryFn: () => getProduct(id), enabled: gate.allowed && !!id, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  const data = gate.allowed ? query.data : undefined
  const own = data?.product.ownerId === gate.data?.me.id
  const blocked = data ? purchaseBlock(data.balance, data.product.stock, data.product.price) : ''
  return <Page title='这份心意，想送给你' subtitle='每次兑换一份，等待对方接受与兑现。'>
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!data && !query.error ? <Loading /> : data && <>
      <Cover fileId={data.product.coverId} name={data.product.name} large />
      <View className='surface product-detail'><Text className='page-title'>{data.product.name}</Text><View className='row'><Text className='price'>{data.product.price} 积分</Text><Text className='muted'>库存 {data.product.stock} 份</Text></View><Text className='section-title'>兑现说明</Text><Text className='description'>{data.product.description || '暂无额外说明，可以先与对方聊聊。'}</Text><Text className='muted'>我的余额 {data.balance} 积分 · 每单固定 1 份</Text></View>
      {added && <Notice>已加入购物车，在购物页内可以查看候选。</Notice>}{blocked && !own && <Notice>{blocked}</Notice>}
      {own ? <Button className='button' onClick={() => void navigate(`/packages/commerce/product-edit/index?id=${id}`)}>编辑我的商品</Button> : <View className='actions'><Button className='button' disabled={!!blocked || action.busy} onClick={() => { rememberCheckoutPrice(id, data.product.price); void navigate(`/packages/commerce/checkout/index?id=${id}`) }}>立即下单</Button><Button className='button secondary' disabled={action.busy} onClick={() => void action.run(() => addCart(id), () => setAdded(true))}>加入购物车</Button></View>}
    </>}
  </Page>
}
