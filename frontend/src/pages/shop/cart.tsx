import { useEffect, useState } from 'react'
import { hideTabBar, showTabBar } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { Button, Radio, Text, View } from '@tarojs/components'
import { getCart, removeCart } from '../../features/catalog/api'
import { ProductSummary } from '../../features/catalog/components'
import { purchaseBlock } from '../../features/orders/presentation'
import { keys } from '../../core/query'
import { useAction } from '../../core/use-action'
import { navigate } from '../../platform'
import { useTheme } from '../../app/theme'
import { accentColors } from '../../core/appearance'
import { rememberCheckoutPrice } from '../../features/orders/checkout-intent'
import { Icon, InlineInfo } from '../../ui/visual'
import { Empty, ErrorState, Loading } from '../../ui'

export function CartSheet({ close }: { close: () => void }) {
  const action = useAction(), [selected, select] = useState('')
  const { scheme, appearance } = useTheme()
  useEffect(() => {
    void hideTabBar({ animation: false }).catch(() => {})
    // Navigation may already have reached a detail page when this effect cleans up.
    return () => { void showTabBar({ animation: false }).catch(() => {}) }
  }, [])
  const query = useQuery({ queryKey: keys.cart, queryFn: getCart, staleTime: 0, refetchInterval: 30000 })
  const product = query.data?.items.find(p => p.id === selected)
  const blocked = product && query.data ? purchaseBlock(query.data.balance, product.stock, product.price) : ''
  return <View className={`sheet-backdrop ${process.env.TARO_ENV === 'h5' ? 'cart-backdrop-h5' : ''}`} onClick={close}><View className='sheet' role='dialog' ariaLabel='购物车' onClick={event => event.stopPropagation()}>
    <View className='row'><Text className='section-title'>购物车 · {query.data?.items.length || 0} 个候选</Text><Button className='icon-button' ariaLabel='关闭购物车' onClick={close}><Icon name='close'/></Button></View>
    <Text className='muted'>一次选一个商品，固定兑换一份。</Text>
    <ErrorState error={query.error || action.error} retry={() => void query.refetch()} />
    {!query.data && !query.error && <Loading />}
    <View className='sheet-scroll'>{query.data?.items.length === 0 && <Empty title='还没有候选商品' description='先逛逛伴侣的小店，收藏一份想要的心意。' />}{query.data?.items.map(p => <View className='cart-row' key={p.id}><Radio className='cart-choice' color={accentColors[appearance.accent][scheme].primary} value={p.id} checked={selected === p.id} disabled={p.stock < 1} ariaLabel={`选择${p.name}`} onClick={() => select(p.id)} /><View className='cart-product'><ProductSummary product={p} stock={p.stock} /><Button className='text-button' disabled={action.busy} onClick={() => void action.run(() => removeCart(p.id))}>移除</Button></View></View>)}</View>
    {blocked && <Text className='warning-text'>{blocked}</Text>}
    <InlineInfo>加入购物车不占积分或库存。</InlineInfo>
    <View className='cart-footer'><Text>本次 <Text className='price'>{product?.price??'…'}</Text> 积分</Text>    <Button className='button' disabled={!product || !!blocked || action.busy} onClick={() => { if (product) { rememberCheckoutPrice(product.id, product.price); close(); void navigate(`/packages/commerce/checkout/index?id=${product.id}`) } }}>{product?'确认所选商品':'选择一个商品'}</Button></View>
  </View></View>
}
