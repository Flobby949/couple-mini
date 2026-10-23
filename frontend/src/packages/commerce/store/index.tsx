import { useArtwork } from '../../../ui/use-artwork'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getCatalog, setProductAvailability } from '../../../features/catalog/api'
import { ProductSummary } from '../../../features/catalog/components'
import { keys } from '../../../core/query'
import { useAction } from '../../../core/use-action'
import { pending } from '../../../core/operations'
import { navigate } from '../../../platform'
import { Empty, ErrorState, Loading } from '../../../ui'
import { PersonRow } from '../../../ui/visual'
export default function StorePage(){
 const { emptyStore: empty } = useArtwork()
 const action=useAction(),[changing,setChanging]=useState('')
 const gate=useGate(),query=useQuery({queryKey:keys.catalog('mine'),queryFn:()=>getCatalog('mine'),enabled:gate.allowed,refetchInterval:gate.allowed?30000:false,staleTime:0})
 function changeAvailability(id:string,onSale:boolean){setChanging(id);void action.run(()=>setProductAvailability(id,onSale)).finally(()=>setChanging(''))}
 return <Page title='我的小店'><ErrorState error={gate.error||query.error||action.error} retry={()=>{void gate.refetch();void query.refetch()}}/>{(!gate.canShow||!query.data)&&!query.error?<Loading/>:gate.canShow&&query.data&&<>
  <Text className='page-title store-title'>{gate.data!.me.nickname}的小店</Text><Text className='muted store-subtitle'>用喜欢的方式，把日常过得更温柔。</Text>
  <View className='surface'><PersonRow user={gate.data!.me} partnerId={gate.data!.partner!.id} title={`${gate.data!.me.nickname}的小店`} description='把想为你做的小事，放在这里。'/></View>
  {query.data.products.length===0&&<Empty image={empty} title='你的第一份心意，还没上架' description='添加一张封面，写下你愿意兑现的小事'/>}
  <Button className='button' onClick={()=>void navigate('/packages/commerce/product-edit/index')}>＋ 新建商品</Button>
  <Text className='muted'>下架后暂停新下单，已有订单仍可正常兑现。</Text>
  {query.data.products.length===0&&<Text className='muted empty-store-note'>商品由你创建，没有系统预置商品</Text>}
  <View className='store-products'>{query.data.products.map(p=><View className='surface' key={p.id}><ProductSummary product={p} stock={p.stock}/><View className='row product-footer'><Text className='muted'>{p.onSale?'已上架':'已下架'}</Text><View className='row'><Button className='button secondary small' ariaLabel={`${p.onSale?'下架':'上架'}${p.name}`} loading={action.busy&&changing===p.id} disabled={!gate.allowed||action.busy||!!pending()} onClick={()=>changeAvailability(p.id,!p.onSale)}>{p.onSale?'下架':'上架'}</Button><Button className='button secondary small' disabled={action.busy} onClick={()=>void navigate(`/packages/commerce/product-edit/index?id=${p.id}`)}>编辑商品</Button></View></View></View>)}</View>
 </>}</Page>
}
