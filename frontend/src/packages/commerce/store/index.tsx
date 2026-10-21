import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getCatalog } from '../../../features/catalog/api'
import { ProductSummary } from '../../../features/catalog/components'
import { keys } from '../../../core/query'
import { navigate } from '../../../platform'
import { Empty, ErrorState, Loading } from '../../../ui'
import { PersonRow } from '../../../ui/visual'
import empty from '../../../assets/empty-store.png'
export default function StorePage(){
 const gate=useGate(),query=useQuery({queryKey:keys.catalog('mine'),queryFn:()=>getCatalog('mine'),enabled:gate.allowed,refetchInterval:gate.allowed?30000:false,staleTime:0})
 return <Page title='我的小店'><ErrorState error={gate.error||query.error} retry={()=>{void gate.refetch();void query.refetch()}}/>{(!gate.allowed||!query.data)&&!query.error?<Loading/>:gate.allowed&&query.data&&<>
  <Text className='page-title store-title'>{gate.data!.me.nickname}的小店</Text><Text className='muted store-subtitle'>用喜欢的方式，把日常过得更温柔。</Text>
  <View className='surface'><PersonRow user={gate.data!.me} partnerId={gate.data!.partner!.id} title={`${gate.data!.me.nickname}的小店`} description='把想为你做的小事，放在这里。'/></View>
  {query.data.products.length===0&&<Empty image={empty} title='你的第一份心意，还没上架' description='添加一张封面，写下你愿意兑现的小事'/>}
  <Button className='button' onClick={()=>void navigate('/packages/commerce/product-edit/index')}>＋ 新建商品</Button>
  {query.data.products.length===0&&<Text className='muted empty-store-note'>商品由你创建，没有系统预置商品</Text>}
  <View className='store-products'>{query.data.products.map(p=><View className='surface' key={p.id}><ProductSummary product={p} stock={p.stock}/><View className='row product-footer'><Text className='muted'>每单固定兑换一份</Text><Button className='button secondary small' onClick={()=>void navigate(`/packages/commerce/product-edit/index?id=${p.id}`)}>编辑商品</Button></View></View>)}</View>
 </>}</Page>
}
