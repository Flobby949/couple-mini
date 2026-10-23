/* THESIS: 同一天的两枚心情上下相伴，月历一次看见两个人。
 * OWN-WORLD: 复用既有亮暗语义色与小团子，七列日期网格、双人记录。
 * STORY: 切换月份、选择日期，读取双方真实签到；无单人筛选或补签。
 * FIRST VIEWPORT: 返回、说明、月份、月历、当天两行详情。
 * FORM: 用户确认的双人心情日历，沿用 checkin-mood-dual-calendar 图稿。
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { keys, queries } from '../../../core/query'
import { beijingTime } from '../../../core/values'
import { ErrorState, Loading } from '../../../ui'
import { Avatar, Icon } from '../../../ui/visual'
import { getCheckinCalendar } from '../../../features/checkin/api'
import { getHome } from '../../../features/home/api'
import { navigate } from '../../../platform'
import { calendarCells, dayLabel, monthLabel, shiftMonth, weekdays } from '../../../features/checkin/calendar'
import { MoodImage } from '../../../features/checkin/mood-image'
import { moodOption } from '../../../features/checkin/moods'
import { useCheckinDay } from '../../../features/checkin/use-checkin-day'
import type { CheckinEntry } from '../../../contracts/checkin'

function DayMood({ entry, name, future }: { entry: CheckinEntry | null; name: string; future: boolean }) {
  const mood = moodOption(entry?.mood)
  return <View className='calendar-mood-slot' ariaLabel={`${name}：${future ? '未来日期' : entry ? mood?.label || '已签到，未记录心情' : '未签到'}`}>
    {!future && (mood ? <MoodImage mood={mood.id} size={34} decorative/> : <Text className={entry ? 'calendar-legacy' : 'calendar-missing'}>{entry ? '✓' : ''}</Text>)}
  </View>
}

export default function CheckinCalendarPage() {
  const gate = useGate(), context = gate.data, date = context?.businessDate || ''
  const actor = context?.me.id || '', couple = context?.couple?.id || ''
  const [month, setMonth] = useState(''), [selected, setSelected] = useState('')
  const previousDay = useRef(''), previousRevision = useRef<string>()
  const milestoneQuery = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, refetchInterval: gate.allowed ? 15000 : false })
  const milestones = gate.canShow && milestoneQuery.data?.context.me.id === actor && milestoneQuery.data.context.couple?.id === couple ? milestoneQuery.data.milestones : undefined
  const doubleDays = context?.couple?.doubleDays || 0
  const next = milestones?.find(m => m.days > doubleDays)
  useCheckinDay(context, gate.visible)
  useEffect(() => {
    if (!date) return
    if (!month || previousDay.current && month === previousDay.current.slice(0, 7) && month !== date.slice(0, 7)) setMonth(date.slice(0, 7))
    if (!selected || selected === previousDay.current) setSelected(date)
    previousDay.current = date
  }, [date])
  useEffect(() => {
    if (!gate.allowed || !date) return
    const next = `${actor}:${couple}:${context?.couple?.checkinRevision || 0}`
    if (previousRevision.current && previousRevision.current !== next) void queries.invalidateQueries({ queryKey: keys.checkinMonth(actor, couple, date.slice(0, 7)), exact: true })
    previousRevision.current = next
  }, [gate.allowed, actor, couple, context?.couple?.checkinRevision, date])
  const query = useQuery({ queryKey: keys.checkinMonth(actor, couple, month), queryFn: () => getCheckinCalendar(month), enabled: gate.allowed && !!month, staleTime: month === date.slice(0, 7) ? 30000 : Infinity, gcTime: 30 * 60 * 1000 })
  const data = gate.canShow ? query.data : undefined
  const selectedDay = data?.days.find(day => day.date === selected)
  const days = new Map(data?.days.map(day => [day.date, day]))
  function changeMonth(next: string) { setMonth(next); setSelected(next === date.slice(0, 7) ? date : `${next}-01`) }
  return <Page title='心情日历'>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); void query.refetch() }}/>
    {!data && !query.error && <Loading/>}
    {data && context?.partner && <>
      <ErrorState error={milestoneQuery.error} retry={() => { void milestoneQuery.refetch() }}/>
      {milestones && <Button className='calendar-milestone' onClick={() => void navigate('/packages/account/milestones/index')}>
        <Icon name='gift' tone='primary' size={27}/>
        <View><Text>累计双人签到 {doubleDays} 天</Text><Text className='muted'>{next ? `下一站 ${next.days} 天 · +${next.reward} 入池` : '所有签到里程碑已达成'}</Text><View className='progress' ariaLabel={next ? `里程碑进度 ${doubleDays} / ${next.days} 天` : '签到里程碑全部完成'}><View style={{width:`${next ? Math.min(100, doubleDays / next.days * 100) : 100}%`}}/></View></View>
        <Icon name='chevron' tone='primary' size={17}/>
      </Button>}
      <View className='calendar-month-bar'>
        <Button className='icon-button' disabled={month <= data.firstMonth} ariaLabel='上个月' onClick={() => changeMonth(shiftMonth(month, -1))}><Icon name='back' tone={month <= data.firstMonth ? 'muted' : 'primary'} size={18}/></Button>
        <Text className='calendar-month-title'>{monthLabel(month)}</Text>
        <Button className='icon-button' disabled={month >= date.slice(0, 7)} ariaLabel='下个月' onClick={() => changeMonth(shiftMonth(month, 1))}><Icon name='chevron' tone={month >= date.slice(0, 7) ? 'muted' : 'primary'} size={18}/></Button>
        <Button className='text-button calendar-today' onClick={() => changeMonth(date.slice(0, 7))}>今天</Button>
      </View>
      <View className='calendar-weekdays'>{weekdays.map(day => <Text key={day}>{day}</Text>)}</View>
      <View className='calendar-grid'>
        {calendarCells(month).map((value, index) => value ? <Button key={value} className={`calendar-day ${value === selected ? 'selected' : ''} ${value === date ? 'is-today' : ''} ${value > date ? 'future' : ''}`} disabled={value > date} ariaLabel={`${dayLabel(value)}${value === date ? '，今天' : ''}${value === selected ? '，已选中' : ''}`} onClick={() => setSelected(value)}>
          <Text className='calendar-date'>{Number(value.slice(-2))}</Text>
          <DayMood entry={days.get(value)?.me || null} name={context.me.nickname} future={value > date}/>
          <DayMood entry={days.get(value)?.partner || null} name={context.partner!.nickname} future={value > date}/>
        </Button> : <View key={`empty-${index}`} className='calendar-day calendar-empty'/>)}
      </View>
      <View className='calendar-key'><Text>○ 未签到</Text>{data.days.some(day => day.me?.mood === null || day.partner?.mood === null) ? <Text>✓ 已签到，未记录心情</Text> : <Text>上下分别记录两个人的心情</Text>}</View>
      {selectedDay && <View className='calendar-detail'>
        <Text className='section-title'>{dayLabel(selectedDay.date)}</Text>
        <Text className='muted'>{selectedDay.me && selectedDay.partner ? '两个人都已签到' : selectedDay.me || selectedDay.partner ? '这一天，已有一人签到' : '这一天，还没有签到记录'}</Text>
        {[{ user: context.me, partner: context.partner.id, entry: selectedDay.me }, { user: context.partner, partner: context.me.id, entry: selectedDay.partner }].map(person => {
          const mood = moodOption(person.entry?.mood)
          return <View className='calendar-detail-row' key={person.user.id}><Avatar user={person.user} partnerId={person.partner} size={32}/><View className='calendar-detail-person'><Text>{person.user.nickname}</Text>{person.entry && <Text className='muted'>{beijingTime(person.entry.checkedAt).slice(-5)} 签到</Text>}</View>{mood && <MoodImage mood={mood.id} size={36} decorative/>}<Text className='calendar-detail-label'>{person.entry ? mood?.label || '未记录心情' : '未签到'}</Text></View>
        })}
        {selectedDay.me && selectedDay.partner && <View className='calendar-complete'><Icon name='check' tone='primary' size={18}/><Text>{selected === date ? '今日' : '这天'}双人签到已完成</Text></View>}
      </View>}
    </>}
  </Page>
}
