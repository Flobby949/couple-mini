import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { useGate } from '../../app/hooks'
import { getProduct } from '../../features/catalog/api'
import { useCart } from '../../features/catalog/cart'
import { ProductSummary } from '../../features/catalog/components'
import { purchaseBlock } from '../../features/orders/presentation'
import { rememberCheckoutPrice } from '../../features/orders/checkout-intent'
import { keys } from '../../core/query'
import { navigate } from '../../platform'
import { hideTabBar, showTabBar } from '../../platform/tab-bar'
import { Icon } from '../../ui/visual'
import { ErrorState, Loading, Notice } from '../../ui'

export function ProductSheet({ id, gate, close }: { id: string; gate: ReturnType<typeof useGate>; close: () => void }) {
  const cart = useCart(), [added, setAdded] = useState(0)
  const query = useQuery({ queryKey: keys.product(id), queryFn: () => getProduct(id), enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  const data = gate.canShow ? query.data : undefined
  const blocked = data ? purchaseBlock(data.balance, data.product.stock, data.product.price, data.product.onSale) : ''
  useEffect(() => {
    void hideTabBar({ animation: false }).catch(() => {})
    return () => { void showTabBar({ animation: false }).catch(() => {}) }
  }, [])
  return <View className='sheet-backdrop product-backdrop' catchMove onClick={close}>
    <View className='sheet product-sheet' role='dialog' ariaLabel='商品详情' onClick={event => event.stopPropagation()}>
      <View className='row product-sheet-heading'><Text className='section-title'>商品详情</Text><Button className='icon-button' ariaLabel='关闭商品详情' onClick={close}><Icon name='close'/></Button></View>
      <ScrollView className='product-sheet-scroll' scrollY showScrollbar={false}>
        <ErrorState error={gate.error || query.error || cart.error} retry={() => { cart.retry(); void gate.refetch(); void query.refetch() }} />
        {!data && !query.error && !gate.error ? <Loading /> : data && <>
          <ProductSummary product={data.product} stock={data.product.stock}/>
          <View className='description-panel'><Text className='section-title'>兑现说明</Text><Text className='description'>{data.product.description || '暂无额外说明，可以先与对方聊聊。'}</Text></View>
          <Text className='muted product-sheet-facts'>每单固定 1 份 · 我的余额 {data.balance} 积分</Text>
          {blocked && <Notice>{blocked}</Notice>}
        </>}
      </ScrollView>
      {data && <View className='actions product-sheet-actions'>
        <Button className='button secondary product-sheet-add' ariaLabel={added ? '已加入购物车，再次加入' : '加入购物车'} disabled={!data.product.onSale} onClick={() => { if (cart.add(data.product)) setAdded(count => count + 1) }}>
          <View key={added} className={`product-sheet-cart-feedback${added ? ' is-added' : ''}`} ariaHidden>
            <View className='product-sheet-cart-icon'><Icon name='cart' tone='primary' size={20}/></View>
            {!!added && <Text className='product-sheet-cart-token'>＋</Text>}
          </View>
          <Text>{added ? '已加入' : '加入购物车'}</Text>
        </Button>
        <Button className='button' disabled={!!blocked} onClick={() => { rememberCheckoutPrice(id, data.product.price); close(); void navigate(`/packages/commerce/checkout/index?id=${id}`) }}>立即下单</Button>
      </View>}
    </View>
  </View>
}
