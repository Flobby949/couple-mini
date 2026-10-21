import { Text, View } from '@tarojs/components'
import type { Task, TaskReceipt } from '../../contracts/tasks'
import { beijingTimeSeconds } from '../../core/values'
import { taskStatus } from './presentation'

export function TaskSummary({ task }: { task: Task }) {
  return <View className='task-summary'><View className='row'><Text className='tag'>{task.kind === 'joint' ? '共同任务' : '伴侣任务'}</Text><Text className='muted'>{taskStatus(task)}</Text></View><Text className='section-title'>{task.name}</Text><Text className='price'>{task.kind === 'joint' ? '每人' : '执行方奖励'} {task.reward} 积分</Text><Text className='muted'>{task.effectiveDeadline ? `${beijingTimeSeconds(task.effectiveDeadline)} 北京时间` : '不限时'}</Text></View>
}
export function TaskResult({ result, name }: { result: TaskReceipt; name: (user: string) => string }) {
  return <View className='surface task-result'><Text className='section-title'>{result.action === 'confirm' ? '任务实际结算' : result.action === 'timed_out' ? '超时结果已结算' : '任务已结束'}</Text>
    {result.awards.map(award => <View className='settlement-line' key={award.userId}><Text>{name(award.userId)}</Text><Text>实际到账 {award.actual} 积分</Text><Text className='muted'>约定 {award.agreed}，未发放 {award.unpaid}{award.balanceAfter !== undefined ? `，当时余额 ${award.balanceAfter}` : ''}</Text></View>)}
    <Text>释放回可用余额 {result.released} 积分</Text>
    {result.action === 'timed_out' && <Text className='warning-text'>执行方罚分 {result.penalty} 积分并入池{result.penaltyBalance !== undefined ? `，当时扣后余额 ${result.penaltyBalance}` : ''}。</Text>}
    {result.action === 'confirm' && <Text className='muted'>{result.reward === 0 ? '本任务约定奖励为 0，已正常完成确认。' : '超出确认当天额度的预留已释放，不保留次日领取权。'}</Text>}
  </View>
}
