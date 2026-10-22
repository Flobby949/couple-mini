import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const state=vi.hoisted(()=>({hide:new Set<()=>void>(),hideBar:vi.fn(),showBar:vi.fn()}))
vi.mock('@tarojs/taro',async()=>{
 const {useEffect}=await import('react')
 return {useDidHide:(callback:()=>void)=>useEffect(()=>{state.hide.add(callback);return()=>{state.hide.delete(callback)}},[callback]),hideTabBar:state.hideBar,showTabBar:state.showBar,default:{pxTransform:(n:number)=>`${n}rpx`}}
})
vi.mock('@tarojs/components',()=>({View:'view',Text:'text',Button:'button',Image:'image',Radio:'radio'}))
vi.mock('@tanstack/react-query',async()=>({...await vi.importActual('@tanstack/react-query'),useQuery:({queryKey}:{queryKey:string[]})=>({data:queryKey[0]==='cart'?{items:[{id:'product',name:'拥抱',price:0,stock:1}],balance:0}:{products:[],balance:0},refetch:vi.fn()})}))
vi.mock('../src/app/page',()=>({Page:({children}:{children:React.ReactNode})=><>{children}</>}))
vi.mock('../src/app/hooks',()=>({useGate:()=>({allowed:true,canShow:true,data:{me:{id:'alice',nickname:'我'},partner:{id:'bob',nickname:'伴侣'}}})}))
vi.mock('../src/app/theme',()=>({useTheme:()=>({scheme:'light',appearance:{accent:'iris'}})}))
vi.mock('../src/core/use-action',()=>({useAction:()=>({busy:false,error:null})}))
vi.mock('../src/features/catalog/components',()=>({ProductSummary:()=>null,Cover:()=>null}))
vi.mock('../src/features/catalog/api',()=>({getCatalog:vi.fn()}))
vi.mock('../src/features/catalog/cart',()=>({useCart:()=>({items:[{id:'product',name:'拥抱',price:0,stock:1}],error:null,add:vi.fn(),remove:vi.fn(),retry:vi.fn()})}))
vi.mock('../src/platform',()=>({navigate:vi.fn(),storage:{read:vi.fn()}}))
import Shop from '../src/pages/shop'
let tree:ReactTestRenderer|undefined
beforeEach(()=>{vi.clearAllMocks();state.hide.clear();state.hideBar.mockResolvedValue({});state.showBar.mockResolvedValue({})})
afterEach(()=>{act(()=>tree?.unmount());tree=undefined})
it('hiding the shop closes its cart instead of reopening it on return',()=>{
 act(()=>{tree=create(<Shop/>)})
 const open=()=>tree!.root.findByProps({id:'shop-cart-dock'}).props.onClick()
 act(open);expect(state.hideBar).toHaveBeenCalledOnce()
 expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(1)
 act(()=>{for(const callback of [...state.hide])callback()})
 expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(0)
 expect(state.showBar).toHaveBeenCalledOnce()
 act(open);expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(1)
})
it('tab bar restoration remains safe if navigation already reached a non-tab page',async()=>{
 state.showBar.mockRejectedValue({errMsg:'showTabBar:fail not TabBar page'})
 act(()=>{tree=create(<Shop/>)})
 act(()=>tree!.root.findByProps({id:'shop-cart-dock'}).props.onClick())
 await act(async()=>{for(const callback of [...state.hide])callback();await Promise.resolve()})
 expect(state.showBar).toHaveBeenCalledOnce()
 expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(0)
})
it('makes the whole cart banner one accessible button without nested buttons',()=>{
 act(()=>{tree=create(<Shop/>)})
 const dock=tree!.root.findByProps({id:'shop-cart-dock'})
 expect(dock.type).toBe('button')
 expect(dock.props.ariaLabel).toBe('查看购物车，1 个候选商品')
 expect(dock.findAllByType('button')).toHaveLength(1)
 expect(tree!.root.findByProps({className:'shopping-action'}).findAllByType('button')).toHaveLength(1)
 act(()=>dock.props.onClick())
 expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(1)
})
