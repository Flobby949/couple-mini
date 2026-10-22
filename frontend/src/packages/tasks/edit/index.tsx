import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { session } from '../../../core/api'
import { keys } from '../../../core/query'
import { useReminderAction } from '../../../features/notifications/use-reminder-action'
import { beijingDeadline, beijingTimeSeconds, parsePoints } from '../../../core/values'
import { getTask, saveTask } from '../../../features/tasks/api'
import { reservationChange } from '../../../features/tasks/presentation'
import { getHome } from '../../../features/home/api'
import type { Task, TaskKind } from '../../../contracts/tasks'
import { replace } from '../../../platform'
import { ErrorState, Loading, Notice } from '../../../ui'
import { BudgetCard, InlineInfo, PersonRow } from '../../../ui/visual'
import { BeijingDateTime } from '../../../ui/date-time'

export default function TaskEdit() {
  const gate = useGate(), params = useRouter().params, id = params.id
  const query = useQuery({ queryKey: keys.task(id || ''), queryFn: () => getTask(id!), enabled: gate.allowed && !!id, staleTime: 0, refetchInterval: gate.allowed && id ? 30000 : false })
  const budget = useQuery({ queryKey: keys.home, queryFn: getHome, enabled: gate.allowed, staleTime: 0, refetchInterval: gate.allowed ? 30000 : false })
  const authenticated = gate.data?.stage === 'ready' && session()?.user.id === gate.data.me.id
  const owned = !id || query.data?.task.creatorId === gate.data?.me.id
  return <Page title={id ? '编辑双方接受前的约定' : '新建一个小约定'} subtitle='发布先预留积分，另一方接受后开始。'>
    <ErrorState error={gate.error || query.error || budget.error} retry={() => { void gate.refetch(); void budget.refetch(); if (id) void query.refetch() }} />
    {!authenticated || !budget.data || id && (!query.data || !query.isFetchedAfterMount) ? <Loading /> : !owned ? <Notice>只有发布方可以编辑这份约定。</Notice> : <TaskForm key={id || 'new'} task={query.data?.task} initialKind={params.kind === 'partner' ? 'partner' : 'joint'} available={budget.data.points.available} serverTime={gate.data!.serverTime} canSubmit={gate.allowed} partner={gate.data!.partner!} me={gate.data!.me} />}
  </Page>
}
function TaskForm({ task, initialKind, available, serverTime, canSubmit, partner,me }: { task?: Task; initialKind: TaskKind; available: number; serverTime: string; canSubmit: boolean; partner:{id:string;nickname:string};me:{id:string;nickname:string} }) {
  const [kind, setKind] = useState<TaskKind>(task?.kind || initialKind), [name, setName] = useState(task?.name || ''), [description, setDescription] = useState(task?.description || ''), [reward, setReward] = useState(task ? String(task.reward) : '')
  const initial = task?.deadline ? beijingTimeSeconds(task.deadline) : ''
  const [date, setDate] = useState(initial.slice(0,10)), [time, setTime] = useState(initial.slice(11,16)), [changed, setChanged] = useState(false)
  const action = useReminderAction(canSubmit), amount = parsePoints(reward)
  const deadline = !changed && task?.deadline ? task.deadline : beijingDeadline(date,time)
  const preview = amount === null ? undefined : reservationChange(kind, amount, task?.reserved || 0, available)
  const locked = !!task && task.status !== 'pending'
  const valid = name.trim() && amount !== null && !preview!.insufficient && (kind === 'joint' || deadline && Date.parse(deadline) > Date.parse(serverTime))
  function submit() {
    if (!canSubmit || locked || !valid) return
    void action.run(() => saveTask(task?.id, { kind, name, description, reward, ...(kind === 'partner' ? { deadline: deadline! } : {}) }), async result => { await replace(`/packages/tasks/detail/index?id=${result.taskId}`) })
  }
  return <View className='form task-edit-form'>
    <ErrorState error={action.error} />
    {locked && <Notice>任务已被接受或结束，不能再修改原约定。草稿保留供查看。</Notice>}
    <View className='segmented'>{(['joint','partner'] as const).map(value => <Button key={value} disabled={!!task || locked || action.busy} className={`segment-option ${kind === value ? 'selected' : ''}`} onClick={() => setKind(value)}>{value === 'joint' ? '共同任务' : '伴侣任务'}</Button>)}</View>
    <View className='surface'><PersonRow user={partner} partnerId={me.id} title={kind==='joint'?`和${partner.nickname}一起完成`:`邀请${partner.nickname}完成`} description={kind==='joint'?'双方一起完成，每人奖励相同，不限时。':'和伴侣一起，把生活过得更温柔。'}/></View>
    <Text className='field-label'>任务名称</Text><Input className='input' ariaLabel='任务名称' maxlength={80} disabled={locked || action.busy} value={name} placeholder='例如，一起整理书架' onInput={e => setName(e.detail.value)} />
    <Text className='field-label'>完成说明</Text><Textarea className='textarea' ariaLabel='任务完成说明' maxlength={2000} disabled={locked || action.busy} value={description} placeholder='把期待和完成方式说清楚。' onInput={e => setDescription(e.detail.value)} />
    <Text className='field-label'>{kind === 'joint' ? '每人奖励积分' : '执行方奖励积分'}</Text><Input className='input' ariaLabel='任务奖励积分' type='digit' value={reward} disabled={locked || action.busy} placeholder='允许明确输入 0' onInput={e => setReward(e.detail.value)} /><Text className='muted'>{amount === null ? '0–1000000000 的非负数字，最多六位小数，四舍五入取整。' : `取整后${kind === 'joint' ? '每人' : '执行方'} ${amount} 积分`}</Text>
    {kind === 'partner' && <><Text className='field-label'>未来截止时间</Text><BeijingDateTime date={date} time={time} original={!changed ? task?.deadline || undefined : undefined} disabled={locked || action.busy} onDate={value => { setDate(value); setChanged(true) }} onTime={value => { setTime(value); setChanged(true) }} /></>}
    <BudgetCard><Text className='section-title'>积分预算</Text><Text>可用 {available} · 本次预留 {preview?.total ?? '…'}{kind==='joint'?'（双方合计）':''}</Text>{task&&preview&&<Text>{preview.delta>=0?`需追加 ${preview.delta}`:`将释放 ${-preview.delta}`} 积分</Text>}{preview?.insufficient&&<Text className='warning-text'>可用预算不足，请降低奖励。</Text>}</BudgetCard>
    <InlineInfo>需另一方接受；接受后原约定锁定。0 分任务也需双方确认。</InlineInfo>
    <Button className='button' loading={action.busy} disabled={!canSubmit || locked || !valid || action.busy} onClick={submit}>{task ? '保存接受前的约定' : `发布并预留 ${preview?.total ?? '…'} 积分`}</Button>
  </View>
}
