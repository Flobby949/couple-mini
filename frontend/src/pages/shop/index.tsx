import { useState } from 'react'
import { useDidHide } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { addCart, getCart, getCatalog } from '../../features/catalog/api'
import { Cover } from '../../features/catalog/components'
import { keys } from '../../core/query'
import { navigate } from '../../platform'
import { Empty, ErrorState, Loading } from '../../ui'
import { Avatar, Icon } from '../../ui/visual'
import { useAction } from '../../core/use-action'
import { emptyStore as empty } from '../../ui/artwork'
import { CartSheet } from './cart'
export default function Shop(){
 const gate=useGate(),action=useAction(),[cart,setCart]=useState(false)
 useDidHide(()=>setCart(false))
 const query=useQuery({queryKey:keys.catalog('partner'),queryFn:()=>getCatalog('partner'),enabled:gate.allowed,refetchInterval:gate.allowed?30000:false,staleTime:0})
 const candidates=useQuery({queryKey:keys.cart,queryFn:getCart,enabled:gate.allowed,refetchInterval:gate.allowed?30000:false})
 return <Page messageEntry title={`${gate.data?.partner?.nickname||'伴侣'}的小店`} subtitle='用喜欢的方式，把日常过得更温柔。'>
  <ErrorState error={gate.error||query.error||action.error} retry={()=>{void gate.refetch();void query.refetch()}}/>
  {(!gate.allowed||!query.data)&&!query.error?<Loading/>:gate.allowed&&query.data&&<>
   <View className='surface shop-owner'><Avatar user={gate.data!.partner!} partnerId={gate.data!.me.id} size={54}/><View className='shop-owner-copy'><Text className='section-title'>{gate.data!.partner!.nickname}</Text><Text className='muted'>用这些小小的心意，和你创造更多美好的日常～</Text></View><View className='shop-balance' onClick={()=>void navigate('/packages/account/points/index')}><Text className='muted'>我的余额</Text><Text><Text className='metric'>{query.data.balance}</Text> 积分</Text></View></View>
   {query.data.products.length===0?<Empty image={empty} title='第一份心意，还在路上' description='对方的小店还没有商品，等第一份心意上架。'/>:<View className='product-grid'>{query.data.products.map(p=><View className='product-tile' key={p.id} onClick={()=>void navigate(`/packages/commerce/product/index?id=${p.id}`)}><Cover fileId={p.coverId} name={p.name} large/><View className='product-tile-copy'><Text className='section-title'>{p.name}</Text><Text className='price'>{p.price} <Text className='points-unit'>积分</Text></Text><Text className='muted'>库存 {p.stock} 份</Text><Button className='product-cart icon-button' ariaLabel={`将${p.name}加入购物车`} disabled={action.busy} onClick={e=>{e.stopPropagation();void action.run(()=>addCart(p.id))}}><Icon name='cart' tone='primary' size={24}/></Button></View></View>)}</View>}
   <View className='shopping-action'><Icon name='cart' tone='primary' size={27}/><View className='cart-dock-copy'><Text className='section-title'>购物车 · {candidates.data?.items.length||0} 个候选</Text><Text className='muted'>每次选 1 件，固定 1 份</Text></View><Button className='button' onClick={()=>setCart(true)}>查看购物车</Button></View>
   {cart&&<CartSheet close={()=>setCart(false)}/>}
  </>}
 </Page>
}
