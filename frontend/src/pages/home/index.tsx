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
import { useTheme } from '../../app/theme'
import { Page } from '../../app/page'
import { useAction } from '../../core/use-action'
import { ErrorState, Loading } from '../../ui'
import panel from '../../assets/checkin-fabric-panel.png'
import { statuses } from '../../features/orders/presentation'
import { Avatar, BalanceTiles, Icon, PoolCard, Section } from '../../ui/visual'
export default function HomePage() {
  const gate = useGate(), action = useAction(), {scheme,appearance} = useTheme()
  const [receipt, setReceipt] = useState<CheckinResult>()
  const query = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  const data = gate.allowed ? query.data : undefined
  const next = data?.milestones.find(m => m.days > data.context.couple!.doubleDays)
  return <Page messageEntry title='今天，也一起' subtitle='平凡的日子，因为有你而特别。'>
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!data && !query.error && <Loading />}
    {data && <>
      <View className='checkin-panel'><Image className='fabric' src={panel} mode='scaleToFill' ariaHidden /><View className='pair'>
        {[{user:data.context.me,checked:data.checkin.me,me:true},{user:data.context.partner!,checked:data.checkin.partner,me:false}].map(item => <View className='person' key={item.user.id}><Avatar user={item.user} partnerId={item.me ? data.context.partner!.id : data.context.me.id} size={112} stitched checked={item.checked} /><View className='person-caption'><Text className='person-name'>{item.me ? '我' : item.user.nickname}</Text><Text className={`checkin-state ${item.checked ? 'checked' : ''}`}>· {item.checked ? '已签到' : '待签到'}</Text></View></View>)}
        <Image className='pair-connection' src={`/assets/ui-icons/checkin-connection-${appearance.accent}-${scheme}.png`} mode='aspectFit' ariaHidden />
      </View><Button className='button checkin-button' loading={action.busy} disabled={action.busy || data.checkin.me} onClick={() => void action.run(() => checkIn(),setReceipt)}>{data.checkin.me ? '今日已签到' : '签到入池 +10'}</Button><Text className='checkin-help'>{data.checkin.me && data.checkin.partner ? '今日两人已签到，基础共 30 积分入池' : '两人都签到，再入池 10 积分'}</Text></View>
      {receipt && <View className='receipt' role='status'><Text className='section-title'>本次共 {receipt.total} 积分入池</Text><Text>签到 {receipt.base}{receipt.doubleBonus > 0 ? ` + 双人奖励 ${receipt.doubleBonus}` : ''}{receipt.milestoneBonus > 0 ? ` + 里程碑奖励 ${receipt.milestoneBonus}` : ''}</Text></View>}
      <PoolCard total={data.points.total} available={data.points.available} reserved={data.points.reserved} />
      <BalanceTiles balance={data.points.balance} earned={data.points.earned} limit={data.points.dailyLimit} remaining={data.points.remaining} />
      <Section title='今日待办'>
        {data.todos.length+data.orderTodos.length+data.taskTodos.length===0 ? <View className='home-empty'><Icon name='check' tone='primary' size={30}/><View><Text className='section-title'>今天的待办都处理好了</Text><Text className='muted'>慢慢来，每一份陪伴都算数。</Text></View></View> : <View className='todo-list'>
          {data.todos.map(p => <Button className='todo-row' key={p.id} onClick={() => void navigate(`/packages/account/rules/index?id=${p.id}`)}><View className='todo-thumb'><Icon name='order' tone='primary'/></View><View className='todo-copy'><Text className='section-title'>共同规则待确认</Text><Text className='muted'>每日上限 {p.dailyLimit} 积分</Text></View><Text className='tag warning'>待我确认</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}
          {data.orderTodos.map(o => <Button className='todo-row' key={o.id} onClick={() => void navigate(`/packages/commerce/order-detail/index?id=${o.id}`)}><View className='todo-thumb'><Icon name='gift' tone='primary'/></View><View className='todo-copy'><Text className='section-title'>{o.snapshot.name}</Text><Text className='todo-type'>订单</Text></View><Text className='tag warning'>{o.cancelPending ? '取消申请待处理' : statuses[o.status]}</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}
          {data.taskTodos.map(t => <Button className='todo-row' key={t.id} onClick={() => void navigate(`/packages/tasks/detail/index?id=${t.id}`)}><View className='todo-thumb'><Icon name='task' tone='primary'/></View><View className='todo-copy'><Text className='section-title'>{t.name}</Text><Text className='todo-type'>任务</Text></View><Text className='tag warning'>{t.status==='pending'?'待我接受':t.status==='awaiting'?'待我确认':'待我处理'}</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}
        </View>}
      </Section>
      <Button className='home-milestone' onClick={()=>void navigate('/packages/account/milestones/index')}><Icon name='gift' tone='primary' size={27}/><View><Text>{next ? `下一站 ${next.days} 天 · +${next.reward} 入池` : '所有签到里程碑已达成'}</Text><View className='progress'><View style={{width:`${next?Math.min(100,data.context.couple!.doubleDays/next.days*100):100}%`}}/></View></View><Text className='primary-text'>{data.context.couple!.doubleDays} / {next?.days || 365}</Text></Button>
    </>}
  </Page>
}
