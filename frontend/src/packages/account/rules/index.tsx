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
import { navigate } from '../../../platform'
import { ErrorState, Loading, Notice } from '../../../ui'
import { Avatar, BudgetCard, ConnectedPair, Icon, InlineInfo } from '../../../ui/visual'

export default function RulesPage() {
  const gate = useGate('bound'), action = useAction()
  const [limit, setLimit] = useState(''), [confirmation,setConfirmation] = useState(''), [editing,setEditing]=useState(false)
  const selected = useRouter().params.id, marked = useRef('')
  const query = useQuery({ queryKey: selected ? keys.rule(selected) : keys.rules, queryFn: () => getRules(selected), enabled: gate.allowed, refetchInterval: gate.allowed ? 5000 : false })
  const normalized = parsePoints(limit)
  useEffect(() => { if (gate.allowed && selected && query.data?.proposals.some(p => p.id === selected) && marked.current !== selected && !pending()) { marked.current = selected; void action.run(() => readRuleMessage(selected)) } }, [gate.allowed, selected, query.data])
  return <Page title='两个人，共同约定' subtitle='由一方提出，另一方确认后生效。'>
    {!gate.canShow && !gate.error && <Loading />}
    <ErrorState error={gate.error || query.error || action.error} retry={() => { void gate.refetch(); void query.refetch() }} />
    {gate.canShow && <>
      {confirmation && <Notice>{confirmation}</Notice>}
      {query.data?.dailyLimit == null && <><View className='onboarding-heading'><Text className='page-title'>先约定，再一起开始</Text><Text className='muted'>由一方提出，另一方确认后生效</Text></View><ConnectedPair me={gate.data!.me} partner={gate.data!.partner!}/><Button className='text-button' onClick={() => void navigate('/packages/account/profile/index')}>设置我的头像和昵称</Button></>}
      {query.data?.dailyLimit != null && <BudgetCard><Text className='section-title'>当前每日获得上限</Text><Text><Text className='number'>{query.data.dailyLimit}</Text> 积分 / 人 / 天</Text><Text className='muted'>任务奖励与伴侣赠送共用额度</Text></BudgetCard>}
      {query.data?.dailyLimit != null && <Button className='text-button propose-toggle' onClick={()=>setEditing(!editing)}><Icon name='plus' size={18} tone='primary'/>{editing?'收起新方案':'提出新方案'}</Button>}
      {(editing||query.data?.dailyLimit==null) && <View className='surface form rules-form'><Text className='section-title'>每日积分获得上限</Text><View className='gift-amount'><Input className='input' ariaLabel='新每日获得上限' type='digit' value={limit} placeholder='输入上限' onInput={e => setLimit(e.detail.value)}/><Text>积分</Text></View><Text className='muted'>{normalized===null?'允许 0，最多六位小数。':`四舍五入后为 ${normalized} 积分`}</Text><Button className='button' loading={action.busy} disabled={action.busy||normalized===null} onClick={()=>void action.run(()=>proposeRules(limit),()=>{setLimit('');setEditing(false)})}>提出共同规则</Button></View>}
      <Text className='section-title section-heading'>规则提议</Text>
      {query.data?.proposals.length === 0 && <InlineInfo>还没有提议，可以先说说你们希望的每日上限。</InlineInfo>}
      {query.data?.proposals.map(p => {
        const proposer=p.proposerId===gate.data!.me.id?gate.data!.me:gate.data!.partner!
        return <View className={`surface proposal ${selected===p.id?'selected':''}`} key={p.id}>
          <View className='row'><View className='proposal-person'><Avatar user={proposer} partnerId={proposer.id===gate.data!.me.id?gate.data!.partner!.id:gate.data!.me.id} size={40}/><View><Text className='section-title'>{p.proposerId===gate.data!.me.id?'我':proposer.nickname}提出新方案</Text><Text className='muted'>{beijingTime(p.createdAt)}</Text></View></View><Text className='tag'>{p.status==='pending'?p.proposerId===gate.data!.me.id?'等对方确认':'待我确认':p.status==='active'?'已确认':'已作废'}</Text></View>
          <View className='rule-change'><Text>{p.previousLimit===null?'首次约定':p.previousLimit}</Text><Text className='muted'>→</Text><Text className='number primary-text'>{p.dailyLimit}</Text><Text className='muted'>积分 / 人 / 天</Text></View>
          {p.status==='pending'&&p.proposerId!==gate.data!.me.id&&<Button className='button' disabled={action.busy} onClick={()=>void action.run(()=>confirmRules(p.id),result=>setConfirmation(result.voidedCount>0?'共同规则已生效，其余待确认提议已自动作废。':'共同规则已生效。'))}>同意这份规则</Button>}
        </View>
      })}
      <View className='surface fixed-rules'><Text className='section-title'>固定的小约定</Text><View><Icon name='sun' size={20} tone='primary'/><Text>每人每日签到 +10 入池；双方同日签到，再 +10。</Text></View><View><Icon name='gift' size={20} tone='primary'/><Text>累计双人签到 7 / 30 / 100 / 365 天，额外入池 30 / 100 / 300 / 1000 积分，漏签不清零。</Text></View><View><Icon name='wallet' size={20} tone='primary'/><Text>签到入池和订单退款不占个人每日获得额度，上限可以为 0。</Text></View></View>
      {gate.data?.stage === 'ready' && <Button className='button secondary' onClick={() => void routeContext(gate.data!)}>继续进入</Button>}
    </>}
  </Page>
}
