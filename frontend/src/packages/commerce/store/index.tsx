import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getCatalog } from '../../../features/catalog/api'
import { ProductSummary } from '../../../features/catalog/components'
import { keys } from '../../../core/query'
import { navigate } from '../../../platform'
import { Empty, ErrorState, Loading } from '../../../ui'
import empty from '../../../assets/empty-store.png'

export default function StorePage() {
  const gate = useGate()
  const query = useQuery({ queryKey: keys.catalog('mine'), queryFn: () => getCatalog('mine'), enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  return <Page title='我的小店' subtitle='把愿意兑现的小心意，认真放在这里。'>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {(!gate.allowed || !query.data) && !query.error ? <Loading /> : gate.allowed && query.data && <>
      <Button className='button' onClick={() => void navigate('/packages/commerce/product-edit/index')}>新建商品</Button>
      {query.data.products.length === 0 && <Empty image={empty} title='你的小店，等第一份心意' description='商品由你自己创建，封面、积分价和兑现约定都由你决定。' />}
      <View className='store-products'>{query.data.products.map(p => <View className='surface' key={p.id}><ProductSummary product={p} stock={p.stock} /><View className='row product-footer'><Text className='muted'>每单固定兑换一份</Text><Button className='button secondary small' onClick={() => void navigate(`/packages/commerce/product-edit/index?id=${p.id}`)}>编辑商品</Button></View></View>)}</View>
    </>}
  </Page>
}
