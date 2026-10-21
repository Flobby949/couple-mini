/* THESIS: 购物只浏览伴侣小店，一次兑换一份心意。
 * OWN-WORLD: 延续 A 的圆角表面与语义色，完整支持明暗与三种主题色。
 * STORY: 看封面与库存，暂存候选，明确确认价格，再查看双方处理的订单。
 * FIRST VIEWPORT: 店主与本人余额在前，双列商品随后，页内购物车独立于四 Tab。
 * FORM: 采用已确认 v2 购物/下单/订单图稿；金额、状态、文字都取真实 API。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { getCatalog } from '../../features/catalog/api'
import { Cover } from '../../features/catalog/components'
import { keys } from '../../core/query'
import { navigate } from '../../platform'
import { Empty, ErrorState, Loading } from '../../ui'
import empty from '../../assets/empty-store.png'
import { CartSheet } from './cart'

export default function Shop() {
  const gate = useGate()
  const [cart, setCart] = useState(false)
  const query = useQuery({ queryKey: keys.catalog('partner'), queryFn: () => getCatalog('partner'), enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  return <Page title='只为你开的小店' subtitle='用积分，兑换一份属于两个人的小确幸。'>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {(!gate.allowed || !query.data) && !query.error ? <Loading /> : gate.allowed && query.data && <>
      <View className='surface shop-header'><View><Text className='section-title'>{gate.data!.partner!.nickname}的小店</Text><Text className='muted'>我的余额 {query.data.balance} 积分</Text></View><Button className='text-button' onClick={() => void navigate('/packages/commerce/orders/index')}>我的订单 ›</Button></View>
      {query.data.products.length === 0 ? <Empty image={empty} title='第一份心意，还在路上' description='对方的小店还没有商品，等第一份心意上架。' /> : <View className='product-grid'>{query.data.products.map(p => <View className='product-tile' key={p.id}><Cover fileId={p.coverId} name={p.name} large /><View className='product-tile-copy'><Text className='section-title'>{p.name}</Text><Text className='price'>{p.price} 积分</Text><Text className='muted'>{p.stock > 0 ? `库存 ${p.stock} 份` : '暂无库存'}</Text><Button className='button secondary small' onClick={() => void navigate(`/packages/commerce/product/index?id=${p.id}`)}>看看这份心意</Button></View></View>)}</View>}
      <View className='shopping-action'><Button className='button' onClick={() => setCart(true)}>打开购物车</Button></View>
      {cart && <CartSheet close={() => setCart(false)} />}
    </>}
  </Page>
}
