import { useArtwork } from '../../../ui/use-artwork'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getCatalog, setProductAvailability } from '../../../features/catalog/api'
import { Cover } from '../../../features/catalog/components'
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
  {query.data.products.length===0&&<Text className='muted empty-store-note'>商品由你创建，没有系统预置商品</Text>}
  <View className='store-products'>{query.data.products.map(p=><View className={`surface store-product-card${p.onSale?'':' is-off-sale'}`} key={p.id}>
   <View className='product-summary'>
    <View className='store-product-cover'><Cover fileId={p.coverId} name={p.name}/>{!p.onSale&&<View className='store-cover-mask'><Image className='store-off-sale-stamp' src='/packages/commerce/assets/off-sale-stamp.png' mode='aspectFit' ariaLabel='已下架'/></View>}</View>
    <View className='product-copy'><Text className='section-title'>{p.name}</Text><Text className='price'>{p.price} <Text className='points-unit'>积分</Text></Text><Text className='muted'>{p.stock>0?`库存 ${p.stock} 份`:'暂无库存'}</Text></View>
   </View>
   <View className='store-product-actions'><Button className={`button small${p.onSale?' secondary':''}`} ariaLabel={`${p.onSale?'下架':'重新上架'}${p.name}`} loading={action.busy&&changing===p.id} disabled={!gate.allowed||action.busy||!!pending()} onClick={()=>changeAvailability(p.id,!p.onSale)}>{p.onSale?'下架商品':'重新上架'}</Button><Button className='button secondary small' disabled={action.busy} onClick={()=>void navigate(`/packages/commerce/product-edit/index?id=${p.id}`)}>编辑商品</Button></View>
  </View>)}</View>
 </>}</Page>
}
