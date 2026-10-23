import { useArtwork } from '../../ui/use-artwork'
import { useState } from 'react'
import { useDidHide } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { getCatalog } from '../../features/catalog/api'
import { useCart } from '../../features/catalog/cart'
import { Cover } from '../../features/catalog/components'
import { keys } from '../../core/query'
import { navigate } from '../../platform'
import { Empty, ErrorState, Loading } from '../../ui'
import { Avatar, Icon } from '../../ui/visual'
import { CartSheet } from './cart'
import { ProductSheet } from './product-sheet'
import { CartFlight, useCartFlight } from './cart-flight'
export default function Shop(){
 const { emptyStore: empty } = useArtwork()
 const gate=useGate(),candidates=useCart(),[cart,setCart]=useState(false),[productId,setProductId]=useState('')
 const motion=useCartFlight()
 const openProduct=(id:string)=>{motion.cancel();setCart(false);setProductId(id)}
 useDidHide(()=>{setCart(false);setProductId('')})
 const query=useQuery({queryKey:keys.catalog('partner'),queryFn:()=>getCatalog('partner'),enabled:gate.allowed,refetchInterval:gate.allowed?30000:false,staleTime:0})
 return <Page messageEntry title={`${gate.data?.partner?.nickname||'伴侣'}的小店`} subtitle='用喜欢的方式，把日常过得更温柔。'>
  <ErrorState error={gate.error||query.error||candidates.error} retry={()=>{candidates.retry();void gate.refetch();void query.refetch()}}/>
  {(!gate.canShow||!query.data)&&!query.error?<Loading/>:gate.canShow&&query.data&&<>
   <View className='surface shop-owner'><Avatar user={gate.data!.partner!} partnerId={gate.data!.me.id} size={54}/><View className='shop-owner-copy'><Text className='section-title'>{gate.data!.partner!.nickname}</Text><Text className='muted'>用这些小小的心意，和你创造更多美好的日常～</Text></View><View className='shop-balance' onClick={()=>void navigate('/packages/account/points/index')}><Text className='muted'>我的余额</Text><Text><Text className='metric'>{query.data.balance}</Text> 积分</Text></View></View>
   {query.data.products.length===0?<Empty image={empty} title='第一份心意，还在路上' description='对方的小店还没有商品，等第一份心意上架。'/>:<View className='product-grid'>{query.data.products.map(p=><View className='product-tile' key={p.id} onClick={()=>openProduct(p.id)}><Cover fileId={p.coverId} name={p.name} large/><View className='product-tile-copy'><Button className='product-title' ariaLabel={`查看${p.name}详情`} onClick={e=>{e.stopPropagation();openProduct(p.id)}}>{p.name}</Button><Text className='price'>{p.price} <Text className='points-unit'>积分</Text></Text><Text className='muted'>库存 {p.stock} 份</Text><Button id={`cart-add-${p.id}`} className='product-cart icon-button' ariaLabel={`将${p.name}加入购物车`} onClick={e=>{e.stopPropagation();const fly=motion.prepare(p.id,e);if(candidates.add(p))void fly()}}><Icon name='cart' tone='primary' size={24}/></Button></View></View>)}</View>}
  </>}
  {gate.canShow&&<>
   <Button id='shop-cart-dock' className='shopping-action' ariaLabel={`查看购物车，${candidates.items.length} 个候选商品`} style={process.env.TARO_ENV==='h5'?{bottom:'calc(var(--taro-tabbar-height, 50px) + env(safe-area-inset-bottom))'}:undefined} onClick={()=>{motion.cancel();setCart(true)}}><View id='shop-cart-target' className={`cart-dock-icon${motion.receiving?' is-receiving':''}`}><Icon name='cart' tone='primary' size={27}/></View><View className='cart-dock-copy'><Text className='section-title'>购物车 · {candidates.items.length} 个候选</Text><Text className='muted'>每次选 1 件，固定 1 份</Text></View><View className='button'>查看购物车</View></Button>
   {motion.flight&&<CartFlight flight={motion.flight}/>}
   {cart&&<CartSheet close={()=>setCart(false)}/>}
   {productId&&<ProductSheet key={productId} id={productId} gate={gate} close={()=>setProductId('')}/>}
  </>}
 </Page>
}
