import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getOrderCounts, getOrders } from '../../../features/orders/api'
import { ProductSummary } from '../../../features/catalog/components'
import { openOrderCount, statuses } from '../../../features/orders/presentation'
import { keys } from '../../../core/query'
import { beijingTime } from '../../../core/values'
import { navigate } from '../../../platform'
import { Empty, ErrorState, Loading } from '../../../ui'
import { OrderBadge } from '../../../features/orders/badge'

const filters = [{ value: '', label: '全部' }, { value: 'pending', label: '待接单' }, { value: 'fulfilling', label: '待兑现' }, { value: 'awaiting_receipt', label: '待确认' }] as const
export default function OrdersPage() {
  const gate = useGate(), params=useRouter().params, [role, setRole] = useState<'buyer' | 'seller'>(params.role==='seller'?'seller':'buyer'), [status, setStatus] = useState(filters.some(f=>f.value===params.status)?params.status||'':'')
  const query = useInfiniteQuery({ queryKey: keys.orders(role, status), queryFn: ({ pageParam }) => getOrders(role, status, pageParam), initialPageParam: '', getNextPageParam: last => last.nextCursor || undefined, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false, staleTime: 0 })
  const counts = useQuery({ queryKey: keys.orderCounts, queryFn: getOrderCounts, enabled: gate.allowed, refetchInterval: gate.allowed ? 30000 : false })
  const items = query.data?.pages.flatMap(page => page.items)
  return <Page title='每一步，都有回应' subtitle='历史订单保留当时的商品与兑现约定。'>
    <View className='segmented'>{(['buyer', 'seller'] as const).map(value => <Button key={value} className={`segment-option ${role === value ? 'selected' : ''}`} ariaLabel={`${value === 'buyer' ? '我下的单' : '我收到的'}，${gate.allowed?openOrderCount(counts.data?.[value]):0} 个未结束订单`} onClick={() => setRole(value)}>{value === 'buyer' ? '我下的单' : '我收到的'}<OrderBadge count={gate.allowed?openOrderCount(counts.data?.[value]):0}/></Button>)}</View>
    <ScrollView scrollX className='filter-scroll'><View className='filter-options'>{filters.map(filter => <Button className={`text-button filter-option ${status === filter.value ? 'selected' : ''}`} key={filter.value} ariaLabel={filter.value?`${filter.label}，${gate.allowed?counts.data?.[role][filter.value]||0:0} 个订单`:filter.label} onClick={() => setStatus(filter.value)}>{filter.label}{filter.value&&<OrderBadge count={gate.allowed?counts.data?.[role][filter.value]||0:0}/>}</Button>)}</View></ScrollView>
    <ErrorState error={gate.error || query.error || counts.error} retry={() => { void gate.refetch(); void query.refetch(); void counts.refetch() }} />
    {(!gate.allowed || !items) && !query.error && <Loading />}
    {gate.allowed && items?.length === 0 && <Empty title='这里还没有订单' description={role === 'buyer' ? '可以去伴侣的小店看看，挑一份喜欢的心意。' : '收到伴侣的下单后，会出现在这里。'} />}
    {gate.allowed&&items?.map(o=><View className='surface order-summary' key={o.id}><Text className={`tag ${o.status==='pending'||o.status==='awaiting_receipt'?'warning':''}`}>{o.cancelPending?'取消申请待处理':statuses[o.status]}</Text><ProductSummary product={o.snapshot}/><Text className='muted order-card-time'>下单时间 {beijingTime(o.createdAt)}</Text><View className='order-card-action'><Button className='button small' onClick={()=>void navigate(`/packages/commerce/order-detail/index?id=${o.id}`)}>查看{o.allowedActions.includes('confirm')?'并确认':'订单'}</Button></View></View>)}
    {gate.allowed && query.hasNextPage && <Button className='button secondary' loading={query.isFetchingNextPage} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>加载更多订单</Button>}
  </Page>
}
