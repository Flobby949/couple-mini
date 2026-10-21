import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { actOnTask, getTask } from '../../../features/tasks/api'
import { TaskResult, TaskSummary } from '../../../features/tasks/components'
import { taskActions, taskHistoryNames } from '../../../features/tasks/presentation'
import type { TaskAction, TaskReceipt } from '../../../contracts/tasks'
import { keys } from '../../../core/query'
import { pending } from '../../../core/operations'
import { useAction } from '../../../core/use-action'
import { beijingDeadline, beijingTimeSeconds } from '../../../core/values'
import { navigate, switchTab } from '../../../platform'
import { BeijingDateTime } from '../../../ui/date-time'
import { ErrorState, Loading, Notice } from '../../../ui'

export default function TaskDetailPage() {
  const gate = useGate(), id = useRouter().params.id || '', action = useAction()
  const [confirm, setConfirm] = useState<Exclude<TaskAction,'edit'>>(), [date, setDate] = useState(''), [time, setTime] = useState(''), [receipt, setReceipt] = useState<TaskReceipt>()
  const [requestId, setRequestId] = useState<string>()
  const query = useQuery({ queryKey: keys.task(id), queryFn: () => getTask(id), enabled: gate.allowed && !!id, staleTime: 0, refetchInterval: gate.allowed ? 30000 : false })
  const data = gate.allowed ? query.data : undefined, task = data?.task, me = gate.data?.me.id || ''
  const correction = beijingDeadline(date,time)
  const needsDate = confirm === 'reject_completion' && task?.kind === 'partner'
  const terminal = data?.history.slice().reverse().find(event => ['confirm','approve_cancel','reject_accept','expired','timed_out'].includes(event.action))?.result
  const userName = (user: string) => user === me ? '我' : gate.data?.partner?.nickname || '伴侣'
  const confirmLabel = confirm === 'confirm' ? '确认任务完成并结算' : confirm === 'reject_completion' && needsDate ? '确认驳回并设置新期限' : confirm ? `确认${taskActions[confirm]}` : ''
  function execute() {
    if (!confirm || needsDate && (!correction || Date.parse(correction) <= Date.parse(data!.serverTime))) return
    const extra = { ...(needsDate ? { correctionDeadline: correction! } : {}), ...(['approve_cancel','deny_cancel'].includes(confirm) ? { cancelRequestId: requestId } : {}) }
    void action.run(() => actOnTask(id, confirm, extra), result => { setReceipt(result); setConfirm(undefined); setDate(''); setTime('') })
  }
  return <Page title='把约定，一步步做好' subtitle='任务与取消申请分别展示，截止时间不会因申请暂停。'>
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {!data && !query.error ? <Loading /> : task && data && <>
      <Button className='text-button' onClick={() => void switchTab('/pages/tasks/index')}>返回任务列表</Button>
      <View className='surface'><TaskSummary task={task} /><Text className='description'>{task.description || '暂无额外完成说明'}</Text><Text className='muted'>发布方：{userName(task.creatorId)}{task.kind === 'partner' ? ` · 执行方：${userName(task.partnerId)}` : ' · 双方共同完成'}</Text><Text className='muted'>当前预留 {task.reserved} 积分 · 我的当前余额 {data.balance}</Text></View>
      {task.cancelRequest && <Notice><Text className='section-title'>{task.cancelRequest.requesterId === me ? '等待对方处理我的取消申请' : '对方申请取消，待我处理'}</Text><Text>取消申请不冻结主流程，仍可按权限接受、提交、确认或驳回。</Text>{task.effectiveDeadline && task.status !== 'awaiting' && <Text>申请不会暂停截止时间，仍需在 {beijingTimeSeconds(task.effectiveDeadline)} 北京时间前提交；已接受超时仍会罚分。</Text>}</Notice>}
      {task.status === 'awaiting' && <View className='surface task-preview'><Text className='section-title'>{userName(task.submittedBy!)}已提交完成</Text><Text className='muted'>及时提交后，等待确认期间不自动超时。以下只是当前额度下的预计到账，以确认时结算为准。</Text>{data.preview.map(a => <View className='settlement-line' key={a.userId}><Text>{userName(a.userId)}预计到账 {a.actual} / 约定 {a.agreed} 积分</Text>{a.unpaid > 0 && <Text className='muted'>预计 {a.unpaid} 积分未发放，将释放回可用余额。</Text>}</View>)}</View>}
      {terminal && <TaskResult result={terminal} name={userName} />}
      {receipt && !terminal && <View className='receipt'><Text className='section-title'>{taskHistoryNames[receipt.action] || '本次操作已完成'}</Text><Text>主阶段与预留已重新读取，提交完成本身不发放奖励。</Text></View>}
      <View className='order-actions'>{task.allowedActions.filter(name => !!taskActions[name]).map((name,index) => <Button key={name} className={`button ${index === 0 ? '' : 'secondary'}`} disabled={action.busy || !!pending()} onClick={() => { if (name === 'edit') void navigate(`/packages/tasks/edit/index?id=${id}`); else { setRequestId(task.cancelRequest?.id); setConfirm(name) } }}>{taskActions[name]}</Button>)}</View>
      <Text className='section-title section-heading'>约定进度</Text><View className='timeline'>{data.history.map(event => <View className='timeline-row' key={event.id}><Text className='timeline-dot'>•</Text><View><Text className='section-title'>{taskHistoryNames[event.action] || '任务状态已更新'}</Text><Text className='muted'>{event.actorId ? userName(event.actorId) : '系统'} · {beijingTimeSeconds(event.occurredAt)} 北京时间</Text></View></View>)}</View>
      {confirm && <View className='sheet-backdrop' onClick={() => { if (!action.busy) setConfirm(undefined) }}><View className='sheet' role='dialog' ariaLabel={taskActions[confirm]} onClick={e => e.stopPropagation()}><Text className='section-title'>{confirm === 'confirm' ? '确认完成并结算这份任务？' : `${taskActions[confirm]}？`}</Text><TaskSummary task={task} />
        {confirm === 'confirm' ? <><Text>将按确认时双方适用的剩余额度到账，未发出的预留释放回池子，不补发。</Text>{data.preview.map(a => <Text key={a.userId}>{userName(a.userId)}预计到账 {a.actual}，未发放 {a.unpaid} 积分</Text>)}</> : confirm === 'request_cancel' ? <Text>申请需另一方同意才取消，不暂停主流程和截止时间。</Text> : confirm === 'approve_cancel' ? <Text>任务将结束，全部未发放预留释放，不罚分。</Text> : confirm === 'deny_cancel' ? <Text>只关闭取消申请，保留当前最新主阶段与有效截止时间。</Text> : confirm === 'reject_completion' ? <><Text>驳回后恢复未完成，保留预留；{needsDate ? '必须选择未来补正截止时刻。' : '共同任务仍不限时。'}</Text>{needsDate && <BeijingDateTime date={date} time={time} onDate={setDate} onTime={setTime} disabled={action.busy} />}</> : confirm === 'submit' ? <Text>提交后仍需另一方确认，本次不立即发放奖励。</Text> : confirm === 'reject_accept' ? <Text>任务将结束，全部预留释放，不罚分。</Text> : <Text>接受后原约定锁定；伴侣任务仍按原截止时间承担超时责任。</Text>}
        <ErrorState error={action.error} />{['approve_cancel','deny_cancel'].includes(confirm) && requestId !== task.cancelRequest?.id && <Notice>取消申请已变化，请关闭后重新查看。</Notice>}<Button className='button' loading={action.busy} disabled={action.busy || !!pending() || !task.allowedActions.includes(confirm) || ['approve_cancel','deny_cancel'].includes(confirm) && requestId !== task.cancelRequest?.id || !!needsDate && (!correction || Date.parse(correction) <= Date.parse(data.serverTime))} onClick={execute}>{confirmLabel}</Button><Button className='button secondary' disabled={action.busy} onClick={() => setConfirm(undefined)}>先不操作</Button>
      </View></View>}
    </>}
  </Page>
}
