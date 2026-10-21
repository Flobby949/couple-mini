/* THESIS: 两个人的签到是首页的中心，积分与待办随后。
 * OWN-WORLD: 冷白、鸢尾紫、深紫文字；仅签到区域保留织物感。
 * STORY: 先看双方状态，只为自己签到，再看共同预算与个人额度。
 * FIRST VIEWPORT: 问候、成对签到、主要签到按钮、积分池。
 * FORM: 采用用户已确认的 A「双人签到台」结构与 v2 图稿。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { getHome } from '../../features/home/api'
import { checkIn } from '../../features/checkin/api'
import { useGate } from '../../app/hooks'
import { keys } from '../../core/query'
import type { CheckinResult } from '../../contracts/api'
import { navigate } from '../../platform'
import { Page } from '../../app/page'
import { useAction } from '../../core/use-action'
import { Empty, ErrorState, Loading } from '../../ui'
import jar from '../../assets/points-jar.png'
import panel from '../../assets/checkin-fabric-panel.png'
import frame from '../../assets/avatar-stitch-frame.png'
import shelf from '../../assets/home-shelf.png'
import { ProductSummary } from '../../features/catalog/components'
import { statuses } from '../../features/orders/presentation'
import { TaskSummary } from '../../features/tasks/components'

export default function HomePage() {
  const gate = useGate(), action = useAction()
  const [receipt, setReceipt] = useState<CheckinResult>()
  const query = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  const data = gate.allowed ? query.data : undefined
  const next = data?.milestones.find(m => m.days > data.context.couple!.doubleDays)
  return <Page title='今天，也一起' subtitle='生活很普通，但因为有你，才特别。'>
    <Image className='home-shelf' src={shelf} mode='aspectFit' />
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!data && !query.error && <Loading />}
    {data && <>
      <View className='checkin-panel'><Image className='fabric' src={panel} mode='scaleToFill' /><View className='row'><Text className='section-title'>双人签到台</Text><Text className='tag'>{data.context.businessDate}</Text></View><View className='pair'>
        {[{ user: data.context.me, checked: data.checkin.me, me: true }, { user: data.context.partner!, checked: data.checkin.partner, me: false }].map(item => <View className={`person ${item.me ? 'self' : 'partner'}`} key={item.user.id}><View className='avatar'><Text>{item.user.nickname.slice(0, 1)}</Text><Image className='avatar-frame' src={frame} mode='aspectFit' /></View><Text className='person-name'>{item.me ? '我' : item.user.nickname}</Text><Text className={`checkin-state ${item.checked ? 'checked' : ''}`}>{item.checked ? '✓ 已签到' : '待签到'}</Text></View>)}
        <Text className='pair-connector'>一起</Text>
      </View><Button className='button checkin-button' loading={action.busy} disabled={action.busy || data.checkin.me} onClick={() => void action.run(() => checkIn(), setReceipt)}>{data.checkin.me ? '今日已签到' : '签到入池 +10'}</Button><Text className='checkin-help'>{data.checkin.me && data.checkin.partner ? '今天两个人都到了，基础共 30 积分入池' : '两人都签到，再入池 10 积分'}</Text></View>
      {receipt && <View className='receipt' role='status'><Text className='section-title'>本次共 {receipt.total} 积分入池</Text><Text>签到 {receipt.base}{receipt.doubleBonus > 0 ? ` + 双人奖励 ${receipt.doubleBonus}` : ''}{receipt.milestoneBonus > 0 ? ` + 里程碑奖励 ${receipt.milestoneBonus}` : ''}</Text></View>}
      <View className='surface pool' onClick={() => void navigate('/packages/account/history/index')}><Image src={jar} className='jar' mode='aspectFit' /><View className='pool-total'><Text className='section-title'>共同积分池</Text><Text><Text className='number'>{data.points.total}</Text> 积分</Text></View><View className='pool-details'><Text>可用 {data.points.available}</Text><Text className='muted'>已预留 {data.points.reserved}</Text></View></View>
      <View className='metrics'><View><Text className='muted'>我的积分</Text><Text><Text className='metric'>{data.points.balance}</Text> 积分</Text></View><View><Text className='muted'>今日已获得 / 上限</Text><Text><Text className='metric'>{data.points.earned}</Text> / {data.points.dailyLimit}</Text><Text className='muted'>剩余额度 {data.points.remaining} 积分</Text></View></View>
      <Text className='section-title section-heading'>今日待办</Text>
      {data.todos.length === 0 && data.orderTodos.length === 0 && (data.taskTodos || []).length === 0 && <Empty title='今天的待办都处理好了' description='慢慢来，留一点时间给彼此。' />}
      {data.todos.map(p => <View className='surface row todo' key={p.id}><View><Text className='section-title'>共同规则待确认</Text><Text className='muted'>每日上限 {p.dailyLimit} 积分</Text></View><Button className='button small' onClick={() => void navigate(`/packages/account/rules/index?id=${p.id}`)}>去确认</Button></View>)}
      {data.orderTodos.map(o => <View className='surface order-summary' key={o.id}><Text className='tag'>{o.cancelPending ? '取消申请待处理' : statuses[o.status]}</Text><ProductSummary product={o.snapshot} /><Button className='button secondary' onClick={() => void navigate(`/packages/commerce/order-detail/index?id=${o.id}`)}>去处理订单</Button></View>)}
      {(data.taskTodos || []).map(task => <View className='surface task-list-item' key={task.id}><TaskSummary task={task} /><Button className='button secondary' onClick={() => void navigate(`/packages/tasks/detail/index?id=${task.id}`)}>去处理任务</Button></View>)}
      <View className='surface milestone'><Text className='section-title'>累计双人签到 {data.context.couple!.doubleDays} 天</Text><Text className='muted'>{next ? `下个里程碑 ${next.days} 天 · +${next.reward} 积分入池` : '所有签到里程碑都已达成'}</Text><View className='progress'><View style={{ width: `${next ? Math.min(100, data.context.couple!.doubleDays / next.days * 100) : 100}%` }} /></View><Text className='muted'>漏签不清零，每一份陪伴都算数。</Text></View>
    </>}
  </Page>
}
