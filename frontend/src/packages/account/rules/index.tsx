import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { routeContext, useGate } from '../../../app/hooks'
import { getRules, proposeRules, confirmRules } from '../../../features/rules/api'
import { keys } from '../../../core/query'
import { beijingTime, parsePoints } from '../../../core/values'
import { Page } from '../../../app/page'
import { useAction } from '../../../core/use-action'
import { readRuleMessage } from '../../../features/notifications/api'
import { pending } from '../../../core/operations'
import { ErrorState, Loading, Notice } from '../../../ui'

export default function RulesPage() {
  const gate = useGate('bound'), action = useAction()
  const [limit, setLimit] = useState(''), [confirmation,setConfirmation] = useState('')
  const selected = useRouter().params.id, marked = useRef('')
  const query = useQuery({ queryKey: selected ? keys.rule(selected) : keys.rules, queryFn: () => getRules(selected), enabled: gate.allowed, refetchInterval: gate.allowed ? 5000 : false })
  const normalized = parsePoints(limit)
  useEffect(() => { if (gate.allowed && selected && query.data?.proposals.some(p => p.id === selected) && marked.current !== selected && !pending()) { marked.current = selected; void action.run(() => readRuleMessage(selected)) } }, [gate.allowed, selected, query.data])
  return <Page title='两个人，共同约定' subtitle='由一方提出，另一方确认后生效。'>
    {!gate.allowed && !gate.error && <Loading />}
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {gate.allowed && <>
      {confirmation && <Notice>{confirmation}</Notice>}
      <View className='surface form'><Text className='section-title'>每日积分获得上限</Text><Text className='current-limit'>{query.data?.dailyLimit == null ? '等待首次共同确认' : `${query.data.dailyLimit} 积分 / 人 / 天`}</Text><Text className='muted'>任务与伴侣赠送共用每天额度。签到入池和订单退款不计入；上限可以是 0。</Text><Input className='input' ariaLabel='新每日获得上限' type='digit' value={limit} placeholder='输入新的上限，允许 0' onInput={e => setLimit(e.detail.value)} /><Text className='muted'>{normalized === null ? '请输入非负数字，最多六位小数。' : `四舍五入后为 ${normalized} 积分`}</Text><Button className='button' loading={action.busy} disabled={action.busy || normalized === null} onClick={() => void action.run(() => proposeRules(limit), () => setLimit(''))}>提出共同规则</Button></View>
      <Text className='section-title section-heading'>规则提议</Text>
      {query.data?.proposals.length === 0 && <Notice>还没有提议，可以先说说你们希望的每日上限。</Notice>}
      {query.data?.proposals.map(p => <View className={`surface proposal ${selected === p.id ? 'selected' : ''}`} key={p.id}><View className='row'><Text className='section-title'>{p.dailyLimit} 积分 / 人 / 天</Text><Text className='tag'>{p.status === 'pending' ? p.proposerId === gate.data?.me.id ? '等对方确认' : '待我确认' : p.status === 'active' ? '已确认' : '已作废'}</Text></View><Text className='muted'>{p.previousLimit === null ? '首次共同规则' : `提议时上限 ${p.previousLimit} 积分`} · {p.proposerId === gate.data?.me.id ? '我提出' : '伴侣提出'}</Text><Text className='muted'>{beijingTime(p.createdAt)} 北京时间</Text>{p.status === 'pending' && p.proposerId !== gate.data?.me.id && <Button className='button' disabled={action.busy} onClick={() => void action.run(() => confirmRules(p.id),result => setConfirmation(result.voidedCount > 0 ? '共同规则已生效，其余待确认提议已自动作废。' : '共同规则已生效。'))}>同意这份规则</Button>}</View>)}
      <View className='fixed-rules'><Text className='section-title'>固定的小约定</Text><Text>每人每天签到入池 10 积分；双方同日签到再入池 10。累计双人签到 7 / 30 / 100 / 365 天，额外入池 30 / 100 / 300 / 1000 积分。漏签不会清零。</Text></View>
      {gate.data?.stage === 'ready' && <Button className='button secondary' onClick={() => void routeContext(gate.data!)}>继续进入</Button>}
    </>}
  </Page>
}
