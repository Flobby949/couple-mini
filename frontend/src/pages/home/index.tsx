import { useArtwork } from '../../ui/use-artwork'
/* THESIS: 两个人的签到是首页的中心，积分与待办随后。
 * OWN-WORLD: 冷白、鸢尾紫、深紫文字；仅签到区域保留织物感。
 * STORY: 未签到看头像，签到后原位展示心情；完整双人日历从底部文字入口进入。
 * FIRST VIEWPORT: 问候、原布艺双头像/心情、主要签到按钮与紧凑日历入口、积分池。
 * FORM: 沿用 A「双人签到台」，按已确认 v3 原布艺心情签到图扩展。
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { getHome } from '../../features/home/api'
import { checkIn } from '../../features/checkin/api'
import { CheckinPortrait } from '../../features/checkin/checkin-portrait'
import { MoodPicker } from '../../features/checkin/mood-picker'
import { moodOption } from '../../features/checkin/moods'
import { useCheckinDay } from '../../features/checkin/use-checkin-day'
import { useGate } from '../../app/hooks'
import { keys, queries } from '../../core/query'
import { session } from '../../core/api'
import { pending } from '../../core/operations'
import { getCatalog } from '../../features/catalog/api'
import { navigate } from '../../platform'
import { useTheme } from '../../app/theme'
import { Page } from '../../app/page'
import { useReminderAction } from '../../features/notifications/use-reminder-action'
import { ErrorState, Loading } from '../../ui'
import { statuses } from '../../features/orders/presentation'
import { BalanceTiles, Icon, PoolCard, Section } from '../../ui/visual'
export default function HomePage() {
 const { checkinPanel: panel } = useArtwork()
  const gate = useGate(), action = useReminderAction(gate.allowed), {scheme,appearance} = useTheme()
  const [picker, setPicker] = useState(false)
  const query = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  const data = gate.canShow && query.data?.context.businessDate === gate.data?.businessDate ? query.data : undefined
  const businessDate = gate.data?.businessDate
  useCheckinDay(gate.data, gate.visible)
  useEffect(() => { setPicker(false) }, [businessDate, gate.data?.me.id])
  useEffect(() => { if (data?.checkin.me) setPicker(false) }, [data?.checkin.me])
  useEffect(() => {
    if (gate.allowed && query.isSuccess) void queries.prefetchQuery({ queryKey: keys.catalog('partner'), queryFn: () => getCatalog('partner') })
  }, [gate.allowed, query.isSuccess])
  return <Page messageEntry title='今天，也一起' subtitle='平凡的日子，因为有你而特别。'>
    <ErrorState error={gate.error || query.error || (!picker ? action.error : null)} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!data && !query.error && <Loading />}
    {data && <>
      <View className='checkin-panel mood-checkin-panel'><Image className='fabric' src={panel} mode='scaleToFill' ariaHidden /><View className='pair'>
        {[{user:data.context.me,checked:data.checkin.me,entry:data.checkin.meEntry,me:true},{user:data.context.partner!,checked:data.checkin.partner,entry:data.checkin.partnerEntry,me:false}].map(item => <View className='person' key={item.user.id}><CheckinPortrait user={item.user} partnerId={item.me ? data.context.partner!.id : data.context.me.id} checked={item.checked} entry={item.entry}/><View className='person-caption'><Text className='person-name'>{item.user.nickname}</Text><Text className={`checkin-state ${item.checked ? 'checked' : ''}`}>· {item.checked ? moodOption(item.entry?.mood)?.label || '已签到' : '待签到'}</Text></View></View>)}
        <Image className='pair-connection' src={`/assets/ui-icons/checkin-connection-${appearance.accent}-${scheme}.png`} mode='aspectFit' ariaHidden />
      </View><Button className={`checkin-button ${data.checkin.me ? 'checkin-completed' : ''}`} loading={action.busy && !data.checkin.me} disabled={action.busy || !!pending() || data.checkin.me || data.context.businessDate !== businessDate} onClick={() => { action.clearError(); setPicker(true) }}>{data.checkin.me && <Icon name='check' tone='primary' size={20}/>}<Text>{data.checkin.me ? '今日已签到' : '选心情签到 · +10 入池'}</Text></Button>
        <View className='checkin-footer'><Button className='checkin-calendar-link' onClick={() => void navigate('/packages/account/checkin-calendar/index')}><Icon name='calendar' tone='primary' size={17}/><Text>心情日历</Text><Icon name='chevron' tone='primary' size={12}/></Button></View>
      </View>
      {picker && gate.visible && !data.checkin.me && <MoodPicker key={businessDate} busy={action.busy} blocked={!!pending()} error={action.error} close={() => setPicker(false)} confirm={mood => { const actor = data.context.me.id; if (businessDate) void action.run(() => checkIn(mood, businessDate), () => { if (session()?.user.id === actor) setPicker(false) }) }}/>}
      <PoolCard total={data.points.total} available={data.points.available} reserved={data.points.reserved} />
      <BalanceTiles balance={data.points.balance} earned={data.points.earned} limit={data.points.dailyLimit} remaining={data.points.remaining} />
      <Section title='今日待办'>
        {data.todos.length+data.orderTodos.length+data.taskTodos.length===0 ? <View className='home-empty'><Icon name='check' tone='primary' size={30}/><View><Text className='section-title'>今天的待办都处理好了</Text><Text className='muted'>慢慢来，每一份陪伴都算数。</Text></View></View> : <View className='todo-list'>
          {data.todos.map(p => <Button className='todo-row' key={p.id} onClick={() => void navigate(`/packages/account/rules/index?id=${p.id}`)}><View className='todo-thumb'><Icon name='order' tone='primary'/></View><View className='todo-copy'><Text className='section-title'>共同规则待确认</Text><Text className='muted'>每日上限 {p.dailyLimit} 积分</Text></View><Text className='tag warning'>待我确认</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}
          {data.orderTodos.map(o => <Button className='todo-row' key={o.id} onClick={() => void navigate(`/packages/commerce/order-detail/index?id=${o.id}`)}><View className='todo-thumb'><Icon name='gift' tone='primary'/></View><View className='todo-copy'><Text className='section-title'>{o.snapshot.name}</Text><Text className='todo-type'>订单</Text></View><Text className='tag warning'>{o.cancelPending ? '取消申请待处理' : statuses[o.status]}</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}
          {data.taskTodos.map(t => <Button className='todo-row' key={t.id} onClick={() => void navigate(`/packages/tasks/detail/index?id=${t.id}`)}><View className='todo-thumb'><Icon name='task' tone='primary'/></View><View className='todo-copy'><Text className='section-title'>{t.name}</Text><Text className='todo-type'>任务</Text></View><Text className='tag warning'>{t.status==='pending'?'待我接受':t.status==='awaiting'?'待我确认':'待我处理'}</Text><Icon name='chevron' size={15} tone='muted'/></Button>)}
        </View>}
      </Section>
    </>}
  </Page>
}
