import { Text, View } from '@tarojs/components'
import type { Task, TaskReceipt } from '../../contracts/tasks'
import { beijingTimeSeconds } from '../../core/values'
import { taskStatus } from './presentation'
import { Avatar } from '../../ui/visual'
export function TaskSummary({task}:{task:Task}){
 return <View className='task-summary'><View className='row'><Text className='section-title'>{task.name}</Text><Text className={`tag ${['pending','awaiting'].includes(task.status)?'warning':''}`}>{taskStatus(task)}</Text></View><View className='row'><Text className='tag'>{task.kind==='joint'?'共同任务':'伴侣任务'}</Text><Text className='muted'>{task.kind==='joint'?'每人':'奖励'} {task.reward} 积分</Text></View>{task.effectiveDeadline&&<Text className='muted'>{beijingTimeSeconds(task.effectiveDeadline)} 北京时间</Text>}</View>
}
export function TaskResult({result,name,people}:{result:TaskReceipt;name:(id:string)=>string;people:{id:string;nickname:string}[]}){
 const paid=result.awards.reduce((sum,a)=>sum+a.actual,0)
 return <><Text className='section-title section-heading'>{result.action==='confirm'?'积分结算':result.action==='timed_out'?'超时结算':'任务结束结果'}</Text><View className='surface task-result'>
  {result.awards.map(a=>{const person=people.find(p=>p.id===a.userId);return <View className='settlement-line' key={a.userId}><View className='settlement-person'>{person&&<Avatar user={person} partnerId={people.find(p=>p.id!==person.id)!.id} size={48}/>}<Text className='section-title'>{name(a.userId)}</Text></View><Text>实际到账 <Text className='settlement-amount'>{a.actual}</Text> 积分</Text><Text className='muted'>约定 {a.agreed}，未发放 {a.unpaid}{a.balanceAfter!==undefined?` · 当时余额 ${a.balanceAfter}`:''}</Text></View>})}
  {result.action==='timed_out'&&<Text className='warning-text'>执行方罚分 {result.penalty} 积分并入池{result.penaltyBalance!==undefined?`，当时扣后余额 ${result.penaltyBalance}`:''}。</Text>}
  {result.action!=='confirm'&&<Text>释放回可用余额 {result.released} 积分</Text>}
 </View>{result.action==='confirm'&&<View className='settlement-total'><Text>约定共 {paid+result.released} · 实际发放 {paid} · 释放回池 {result.released}</Text><Text className='muted'>{result.reward===0?'本任务约定奖励为 0，已正常完成确认。':'未到账部分受今日额度限制，不再补发。'}</Text></View>}</>
}
