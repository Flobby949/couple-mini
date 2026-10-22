import { useArtwork } from '../../../ui/use-artwork'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { actOnTask, getTask } from '../../../features/tasks/api'
import { TaskResult, TaskSummary } from '../../../features/tasks/components'
import { taskActions, taskHistoryNames } from '../../../features/tasks/presentation'
import { SubscriptionCard } from '../../../features/notifications/subscription-card'
import type { TaskAction, TaskReceipt } from '../../../contracts/tasks'
import { keys } from '../../../core/query'
import { pending } from '../../../core/operations'
import { useReminderAction } from '../../../features/notifications/use-reminder-action'
import { beijingDeadline, beijingTimeSeconds } from '../../../core/values'
import { navigate, switchTab } from '../../../platform'
import { BeijingDateTime } from '../../../ui/date-time'
import { ErrorState, Loading, Notice } from '../../../ui'
import { Avatar, Icon, InlineInfo, PersonRow } from '../../../ui/visual'
export default function TaskDetailPage(){
 const badge = '/packages/tasks' + useArtwork().milestoneRosette
 const gate=useGate(),id=useRouter().params.id||'',action=useReminderAction(gate.allowed)
 const [confirm,setConfirm]=useState<Exclude<TaskAction,'edit'>>(),[date,setDate]=useState(''),[time,setTime]=useState(''),[receipt,setReceipt]=useState<TaskReceipt>(),[requestId,setRequestId]=useState<string>(),[historyOpen,setHistoryOpen]=useState(false)
 const query=useQuery({queryKey:keys.task(id),queryFn:()=>getTask(id),enabled:gate.allowed&&!!id,staleTime:0,refetchInterval:gate.allowed?30000:false})
 const data=gate.canShow?query.data:undefined,task=data?.task,me=gate.data?.me.id||''
 const correction=beijingDeadline(date,time),needsDate=confirm==='reject_completion'&&task?.kind==='partner'
 const terminal=data?.history.slice().reverse().find(e=>['confirm','approve_cancel','reject_accept','expired','timed_out'].includes(e.action))?.result
 const people=gate.data?.partner?[gate.data.me,gate.data.partner]:[]
 const userName=(user:string)=>user===me?'我':gate.data?.partner?.nickname||'伴侣'
 const person=(user:string)=>people.find(p=>p.id===user)!
 const confirmLabel=confirm==='confirm'?'确认任务完成并结算':confirm==='reject_completion'&&needsDate?'确认驳回并设置新期限':confirm?`确认${taskActions[confirm]}`:''
 const disabled=action.busy||!!pending()||!!confirm&&!task?.allowedActions.includes(confirm)||!!confirm&&['approve_cancel','deny_cancel'].includes(confirm)&&requestId!==task?.cancelRequest?.id||!!needsDate&&(!correction||Date.parse(correction)<=Date.parse(data!.serverTime))
 function execute(){if(!confirm||needsDate&&(!correction||Date.parse(correction)<=Date.parse(data!.serverTime)))return;const extra={...(needsDate?{correctionDeadline:correction!}:{}),...(['approve_cancel','deny_cancel'].includes(confirm)?{cancelRequestId:requestId}:{})};void action.run(()=>actOnTask(id,confirm,extra),r=>{setReceipt(r);setConfirm(undefined);setDate('');setTime('')})}
 const reviewing=confirm==='confirm'&&task?.status==='awaiting'
 const preview=data&&task&&<><View className='surface task-preview'><Text className='section-title'>{task.name}</Text><Text className='primary-text'>{userName(task.submittedBy!)}已提交完成</Text><Text className='description'>{task.description||'这份约定，已经有了回应。'}</Text><View className='row'><Icon name='star' tone='primary'/><Text>{task.kind==='joint'?'每人':'执行方'}约定奖励</Text><Text className='price'>{task.reward} 积分</Text></View></View><Text className='section-title section-heading'>完成情况</Text><View className='surface'>{data.preview.map(a=><View className='settlement-line' key={a.userId}><View className='settlement-person'><Avatar user={person(a.userId)} partnerId={people.find(p=>p.id!==a.userId)!.id} size={50}/><Text>{userName(a.userId)}</Text></View><View><Text className='muted'>约定 {a.agreed} 积分</Text><Text>预计到账 <Text className='settlement-amount'>{a.actual}</Text> 积分</Text></View>{a.unpaid>0&&<Text className='muted'>预计 {a.unpaid} 积分释放回可用，以确认时额度为准。</Text>}</View>)}</View><InlineInfo>及时提交后，等待确认期间不自动超时。确认时按各人当日剩余额度结算。</InlineInfo></>
 return <Page title='任务详情' navTitle={reviewing?'确认任务完成':task?.status==='completed'?'任务已完成':undefined} onBack={reviewing?()=>setConfirm(undefined):undefined}>
  <ErrorState error={gate.error||query.error||action.error} retry={()=>{void gate.refetch();void query.refetch()}}/>
  {!id?<Notice>任务入口缺少标识，请返回任务列表。</Notice>:!data&&!query.error&&!gate.error?<Loading/>:task&&data&&<>{reviewing?<>{preview}<View className='actions'><Button className='button secondary' disabled={action.busy} onClick={()=>setConfirm(undefined)}>暂不确认</Button><Button className='button' loading={action.busy} disabled={!!disabled} onClick={execute} ariaLabel='确认任务完成并结算'>确认完成</Button></View></>:<>
   {task.status==='completed'&&<View className='result-hero'><Image src={badge} mode='aspectFit' ariaHidden/><Text className='page-title'>{task.name}</Text><Text className='muted'>本次任务已完成，辛苦啦！</Text></View>}
   {task.status!=='completed'&&<View className='surface'><TaskSummary task={task}/><View className='task-facts'><PersonRow user={person(task.creatorId)} partnerId={task.partnerId} title={`${userName(task.creatorId)} · ${task.kind==='joint'?'共同任务':'伴侣任务'}`} description={task.kind==='joint'?'双方共同完成':`${userName(task.partnerId)}完成这份约定`}/><View className='task-fact'><Icon name='star' tone='primary' size={20}/><Text>奖励积分</Text><View><Text>{task.reward} 积分{task.kind==='joint'?' / 人':''}</Text></View></View><View className='task-fact'><Icon name='clock' tone='muted' size={20}/><Text>截止时间</Text><View><Text>{task.effectiveDeadline?beijingTimeSeconds(task.effectiveDeadline):'不限时'}</Text>{task.effectiveDeadline&&<Text className='muted'>北京时间</Text>}</View></View></View><View className='description-panel'><Text className='section-title'><Icon name='order' size={18}/>任务说明</Text><Text className='description'>{task.description||'暂无额外完成说明'}</Text></View><Text className='muted'>当前预留 {task.reserved} 积分 · 我的余额 {data.balance}</Text></View>}
   {task.cancelRequest&&<Notice><Text className='section-title'>{task.cancelRequest.requesterId===me?'取消申请待对方处理':'对方申请取消，待我处理'}</Text><Text>申请不会暂停主流程和截止时间，仍可按权限提交或确认。</Text>{task.effectiveDeadline&&task.status!=='awaiting'&&<Text>仍需在 {beijingTimeSeconds(task.effectiveDeadline)} 北京时间前提交；已接受超时仍会罚分。</Text>}</Notice>}
   {task.status==='awaiting'&&<View className='surface'><PersonRow user={person(task.submittedBy!)} partnerId={people.find(p=>p.id!==task.submittedBy)!.id} title={`${userName(task.submittedBy!)}已提交完成`} description='请查看完成情况，再确认或驳回。'/><Text className='muted'>等待确认期间不自动超时，提交本身不发放积分。</Text></View>}
   {terminal&&<TaskResult result={terminal} name={userName} people={people}/>}
   {receipt&&!terminal&&<View className='receipt'>{taskHistoryNames[receipt.action]||'本次操作已完成'}</View>}
   <View className='order-actions'>{task.allowedActions.filter(n=>!!taskActions[n]).map((n,index)=><Button key={n} className={`button ${index===0&&n!=='request_cancel'?'':'secondary'}`} disabled={action.busy||!!pending()} onClick={()=>{if(n==='edit')void navigate(`/packages/tasks/edit/index?id=${id}`);else{setRequestId(task.cancelRequest?.id);setConfirm(n)}}}>{taskActions[n]}</Button>)}</View>
   {['pending','active','awaiting'].includes(task.status)&&<SubscriptionCard enabled={gate.allowed} group='任务' disabled={action.busy||!!confirm}/>}
   {terminal&&<View className='form'><Button className='button secondary' onClick={()=>setHistoryOpen(!historyOpen)}>{historyOpen?'收起任务记录':'查看任务记录'}</Button><Button className='button' onClick={()=>void switchTab('/pages/tasks/index')}>返回任务</Button></View>}
   {(!terminal||historyOpen)&&<><Text className='section-title section-heading'>任务动态</Text><View className='timeline'>{data.history.map(e=><View className='timeline-row' key={e.id}><Text className='timeline-dot'>•</Text><View><Text className='section-title'>{taskHistoryNames[e.action]||'任务状态已更新'}</Text><Text className='muted'>{e.actorId?userName(e.actorId):'系统'} · {beijingTimeSeconds(e.occurredAt)} 北京时间</Text></View></View>)}</View></>}
   {!terminal&&<Button className='text-button detail-backlink' onClick={()=>void switchTab('/pages/tasks/index')}>返回任务列表</Button>}
  </>}
  {confirm&&confirm!=='confirm'&&<View className='sheet-backdrop' onClick={()=>{if(!action.busy)setConfirm(undefined)}}><View className='sheet' role='dialog' ariaLabel={taskActions[confirm]} onClick={e=>e.stopPropagation()}><Text className='section-title'>{taskActions[confirm]}？</Text><TaskSummary task={task}/>
   {confirm==='request_cancel'?<Text>申请需另一方同意才取消，不暂停主流程和截止时间。</Text>:confirm==='approve_cancel'?<Text>任务将结束，全部未发放预留释放，不罚分。</Text>:confirm==='deny_cancel'?<Text>只关闭取消申请，保留当前最新主阶段与有效截止时间。</Text>:confirm==='reject_completion'?<><Text>驳回后恢复未完成，保留预留；{needsDate?'必须选择未来补正截止时刻。':'共同任务仍不限时。'}</Text>{needsDate&&<BeijingDateTime date={date} time={time} onDate={setDate} onTime={setTime} disabled={action.busy}/>}</>:confirm==='submit'?<Text>提交后仍需另一方确认，本次不立即发放奖励。</Text>:confirm==='reject_accept'?<Text>任务将结束，全部预留释放，不罚分。</Text>:<Text>接受后原约定锁定；伴侣任务按原截止时间承担超时责任。</Text>}
   <ErrorState error={action.error}/>{['approve_cancel','deny_cancel'].includes(confirm)&&requestId!==task.cancelRequest?.id&&<Notice>取消申请已变化，请关闭后重新查看。</Notice>}<View className='actions'><Button className='button secondary' disabled={action.busy} onClick={()=>setConfirm(undefined)}>先不操作</Button><Button className='button' loading={action.busy} disabled={!!disabled} onClick={execute}>{confirmLabel}</Button></View>
  </View></View>}
  </>}
 </Page>
}
