import { useEffect, useState } from 'react'
import { hideTabBar, showTabBar } from '../../platform/tab-bar'
import { Button, Radio, Text, View } from '@tarojs/components'
import { useCart } from '../../features/catalog/cart'
import { ProductSummary } from '../../features/catalog/components'
import { navigate } from '../../platform'
import { useTheme } from '../../app/theme'
import { accentColors } from '../../core/appearance'
import { rememberCheckoutPrice } from '../../features/orders/checkout-intent'
import { Icon, InlineInfo } from '../../ui/visual'
import { Empty, ErrorState } from '../../ui'

export function CartSheet({ close }: { close: () => void }) {
  const cart = useCart(), [selected, select] = useState('')
  const { scheme, appearance } = useTheme()
  useEffect(() => {
    void hideTabBar({ animation: false }).catch(() => {})
    // Navigation may already have reached a detail page when this effect cleans up.
    return () => { void showTabBar({ animation: false }).catch(() => {}) }
  }, [])
  const product = cart.items.find(p => p.id === selected)
  return <View className={`sheet-backdrop ${process.env.TARO_ENV === 'h5' ? 'cart-backdrop-h5' : ''}`} onClick={close}><View className='sheet' role='dialog' ariaLabel='购物车' onClick={event => event.stopPropagation()}>
    <View className='row'><Text className='section-title'>购物车 · {cart.items.length} 个候选</Text><Button className='icon-button' ariaLabel='关闭购物车' onClick={close}><Icon name='close'/></Button></View>
    <Text className='muted'>一次选一个商品，固定兑换一份。</Text>
    <ErrorState error={cart.error} retry={cart.retry} />
    <View className='sheet-scroll'>{cart.items.length === 0 && <Empty title='还没有候选商品' description='先逛逛伴侣的小店，收藏一份想要的心意。' />}{cart.items.map(p => <View className='cart-row' key={p.id}><Radio className='cart-choice' color={accentColors[appearance.accent][scheme].primary} value={p.id} checked={selected === p.id} ariaLabel={`选择${p.name}`} onClick={() => select(p.id)} /><View className='cart-product'><ProductSummary product={p} /><Button className='text-button' onClick={() => { if (cart.remove(p.id)) select(current => current === p.id ? '' : current) }}>移除</Button></View></View>)}</View>
    <InlineInfo>保存在当前设备，不占积分或库存。上下架状态、价格和库存以下单确认页为准。</InlineInfo>
    <View className='cart-footer'><Text>本次 <Text className='price'>{product?.price??'…'}</Text> 积分</Text>    <Button className='button' disabled={!product} onClick={() => { if (product) { rememberCheckoutPrice(product.id, product.price); close(); void navigate(`/packages/commerce/checkout/index?id=${product.id}`) } }}>{product?'确认所选商品':'选择一个商品'}</Button></View>
  </View></View>
}
