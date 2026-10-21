import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getPreferences, getDeliveries, savePreference, reportAuthorization } from '../../../features/notifications/api'
import { channelNames, authorizationNames, deliveryNames, deliveryReasons } from '../../../features/notifications/presentation'
import type { AuthorizationReport, Channel } from '../../../contracts/notifications'
import { keys } from '../../../core/query'
import { newKey, pending } from '../../../core/operations'
import { useAction } from '../../../core/use-action'
import { session } from '../../../core/api'
import { beijingTime } from '../../../core/values'
import { returnTo, storage } from '../../../platform'
import { requestSubscription, subscriptionSupported } from '../../../platform/subscription'
import { Empty, ErrorState, Loading, Notice } from '../../../ui'
import { Icon, InlineInfo } from '../../../ui/visual'

const descriptions:Record<Channel,string>={in_app:'只在小程序消息中心接收',wechat:'只接收微信订阅消息，需单独授权',both:'站内消息与微信订阅同步提醒',off:'不接收此类通知，首页待办仍保留'}
type Report = AuthorizationReport & { reportId: string }
export default function NotificationTemplatePage() {
  const gate = useGate(), code = useRouter().params.code || '', action = useAction()
  const [choice,setChoice] = useState<Channel>(), [saved,setSaved] = useState(''), [platformBusy,setPlatformBusy] = useState(false), [status,setStatus] = useState(''), [details,setDetails]=useState(false)
  const reportKey = `subscription-report:${session()?.user.id}:${code}`
  const [report,setReport] = useState<Report | undefined>(() => storage.read<Report>(reportKey))
  useDidShow(() => setReport(storage.read<Report>(reportKey)))
  const query = useQuery({ queryKey: keys.preferences, queryFn: getPreferences, enabled: gate.allowed, staleTime: 0 })
  const deliveries = useQuery({ queryKey: keys.deliveries(code), queryFn: () => getDeliveries(code), enabled: gate.allowed && /^[OTPR]\d{2}$/.test(code), staleTime: 0, refetchInterval: gate.allowed ? 15000 : false })
  const template = query.data?.items.find(t => t.code === code), selected = choice ?? template?.channel
  const authenticated = gate.data?.stage === 'ready' && session()?.user.id === gate.data.me.id
  const busy = action.busy || platformBusy || !!pending()
  async function authorize() {
    if (!template?.wechatAvailable || !subscriptionSupported || busy || !gate.allowed || report) return
    const identity = session()?.user.id
    setPlatformBusy(true); setStatus('正在请求本模板的微信订阅授权…')
    const result = await requestSubscription(template.platformTemplateId)
    setPlatformBusy(false)
    if (session()?.user.id !== identity) return
    const next: Report = { code, platformTemplateId: template.platformTemplateId, result, reportId: newKey() }
    try { storage.write(reportKey,next); setReport(next); setStatus(`${authorizationNames[result] || '本次授权不可用'}；结果待同步。`) }
    catch { setStatus('授权结果未能保存在本机，请重新请求。') }
  }
  function syncReport() {
    if (!report || !gate.allowed) return
    void action.run(() => reportAuthorization(report.code,report.platformTemplateId,report.result,report.reportId), () => { storage.remove(reportKey); setReport(undefined); setStatus('本次授权结果已同步。平台会在实际发送时再次校验订阅机会。') })
  }
  return <Page title={template?.name || '这一种消息，怎样提醒'} subtitle={`${code} · 偏好保存与微信授权分别完成。`}>
    <ErrorState error={gate.error || query.error || deliveries.error || action.error} retry={() => { void gate.refetch(); void query.refetch(); void deliveries.refetch() }} />
    {!query.data && !query.error && <Loading />}
    {query.data && !template && <Notice>未找到这个消息模板，可以返回完整列表。</Notice>}
    {authenticated && template && <><View className='template-intro'><View className='template-symbol'><Icon name={code.startsWith('T')?'task':code.startsWith('O')?'order':'bell'} tone='primary' size={30}/></View><View><Text className='section-title'>{template.name}</Text><Text className='muted'>选择这类消息的提醒方式。</Text></View></View><View className='surface channel-options'>{(Object.keys(channelNames) as Channel[]).map(channel=><Button key={channel} className={`channel-option ${selected===channel?'is-selected':''}`} ariaLabel={`${channelNames[channel]}${selected===channel?'，已选中':''}`} disabled={busy} onClick={()=>{setChoice(channel);setSaved('')}}><View className={`radio-mark ${selected===channel?'selected':''}`}>{selected===channel?'✓':''}</View><View><Text className='section-title'>{channelNames[channel]}</Text><Text className='muted'>{descriptions[channel]}</Text></View></Button>)}</View>
      <InlineInfo>只影响以后发生的事情，历史消息保持不变。微信渠道需要单独订阅授权，发送失败不会自动改投站内。</InlineInfo>
      {(selected==='wechat'||selected==='both')&&(!template.wechatAvailable||!subscriptionSupported)&&<Notice>{!template.wechatAvailable?'微信提醒暂不可用：该模板映射或服务凭据尚未配置。':'请在微信小程序中请求订阅，H5 仅支持接收偏好设置。'}</Notice>}
      <Button className='button' disabled={!gate.allowed||busy||selected===template.channel} loading={action.busy} onClick={()=>{if(selected)void action.run(()=>savePreference(code,selected),()=>{setSaved(`已保存：${channelNames[selected]}`);setChoice(undefined)})}}>保存设置</Button>{saved&&<Text className='success-text'>{saved}</Text>}
      <Button className='text-button subscription-toggle' onClick={()=>setDetails(!details)}>{details?'收起':'查看'}微信授权与投递记录 <Icon name='chevron' tone='primary' size={16}/></Button>
      {(details||!!report)&&<>
      <View className='surface form'><Text className='section-title'>微信订阅</Text><Text className='muted'>{!template.wechatAvailable ? '微信提醒暂不可用：该模板映射或服务凭据尚未配置。' : !subscriptionSupported ? '请在微信小程序中请求订阅，H5 仅支持接收偏好设置。' : '只为当前模板请求一次订阅，是否可投递以微信接口结果为准。'}</Text><Text>最近上报：{authorizationNames[template.authorization] || '尚未报告授权'}</Text>{template.authorizationAt && <Text className='muted'>{beijingTime(template.authorizationAt)} 北京时间 · 本机上报，不代表永久授权</Text>}<Text className='muted'>尚未使用的已上报订阅机会 {template.reportedRemaining} 次；平台可能撤销或拒绝。</Text>
        <Button className='button secondary' disabled={!gate.allowed || busy || !!report || !template.wechatAvailable || !subscriptionSupported} onClick={() => void authorize()}>请求本模板微信订阅</Button>{status && <Text className='muted'>{status}</Text>}{report && <Notice><Text>本次结果待同步：{authorizationNames[report.result] || '授权未完成'}。同步失败不撤销已保存的接收偏好。</Text><Button className='button' disabled={!gate.allowed || busy} onClick={syncReport}>同步授权结果</Button><Button className='text-button' disabled={busy} onClick={() => {storage.remove(reportKey);setReport(undefined);setStatus('已清除本机待同步记录，不会撤销你在微信中的选择。')}}>放弃本次上报</Button></Notice>}</View>
      <Text className='section-title section-heading'>最近微信投递</Text><Text className='muted'>仅微信通知也会记录投递结果；不会自动补发不可投递或结果未知的记录。</Text>{deliveries.data?.items.length === 0 && <Empty title='还没有微信投递记录' description='只有业务发生时开启微信渠道的消息才会进入这里。' />}{deliveries.data?.items.map(d => <View className='ledger-row' key={d.id}><View><Text className='section-title'>{d.title}</Text><Text>{deliveryNames[d.status] || '状态待核查'}</Text>{d.reason && <Text className='muted'>{deliveryReasons[d.reason] || '请联系维护者核查'}</Text>}<Text className='muted'>{beijingTime(d.updatedAt)} 北京时间 · 已尝试 {d.attempts} 次</Text></View></View>)}
    </>}</>}
    <Button className='text-button' onClick={() => void returnTo('/packages/account/notification-settings/index')}>查看全部 30 种模板</Button>
  </Page>
}
