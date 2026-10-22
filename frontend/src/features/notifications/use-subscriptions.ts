import { useEffect, useRef, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import type { AuthorizationReport, Preference } from '../../contracts/notifications'
import { session } from '../../core/api'
import { newKey, pending } from '../../core/operations'
import { queries } from '../../core/query'
import { storage } from '../../platform'
import { requestSubscriptions, subscriptionSupported } from '../../platform/subscription'
import { reportAuthorization } from './api'
import type { SubscriptionGroup } from './subscriptions'

type Report = AuthorizationReport & { reportId: string }
const activeRequests = new Set<string>()
const reportKey = (actor: string, code: string) => `subscription-report:${actor}:${code}`
function readReports(actor: string, items: Preference[]) {
  return actor ? items.flatMap(item => {
    const report = storage.read<Report>(reportKey(actor,item.code))
    return report ? [report] : []
  }) : []
}

export function useSubscriptions(items: Preference[], enabled: boolean) {
  const actor = session()?.user.id || '', lock = useRef(false)
  const [busy,setBusy] = useState(false), [error,setError] = useState<Error | null>(null), [status,setStatus] = useState('')
  const [saved,setSaved] = useState<{actor: string; reports: Report[]}>({actor,reports: []})
  const unpersisted = useRef<{actor: string; reports: Report[]}>({actor,reports: []})
  const reports = saved.actor === actor ? saved.reports : []
  const staleReports = reports.filter(report => items.find(item => item.code === report.code)?.platformTemplateId !== report.platformTemplateId)
  function currentReports() {
    const memory = unpersisted.current.actor === actor ? unpersisted.current.reports : []
    return [...new Map([...readReports(actor,items),...memory].map(report => [report.reportId,report])).values()]
  }
  function reload() {
    if (!lock.current) setSaved({actor,reports: currentReports()})
  }
  useEffect(reload,[actor,items])
  useDidShow(reload)

  function discardStale() {
    if (!enabled || lock.current || pending() || session()?.user.id !== actor) return
    try {
      for (const report of staleReports) {
        if (storage.read<Report>(reportKey(actor,report.code))?.reportId === report.reportId) storage.remove(reportKey(actor,report.code))
      }
      if (unpersisted.current.actor === actor) unpersisted.current.reports = unpersisted.current.reports.filter(report => !staleReports.some(stale => stale.reportId === report.reportId))
      setSaved({actor,reports: currentReports()})
      setError(null); setStatus('已清除旧模板的本机待同步结果，不会撤销微信中的订阅。请按当前模板补充次数。')
    } catch { setError(new Error('旧模板结果未能清除，请重试')) }
  }

  async function sync(records: Report[], identity: string) {
    for (const record of records) {
      if (session()?.user.id !== identity) return
      await reportAuthorization(record.code,record.platformTemplateId,record.result,record.reportId)
      if (session()?.user.id !== identity) return
      if (storage.read<Report>(reportKey(identity,record.code))?.reportId === record.reportId) storage.remove(reportKey(identity,record.code))
      if (unpersisted.current.actor === identity) unpersisted.current.reports = unpersisted.current.reports.filter(report => report.reportId !== record.reportId)
      setSaved(previous => previous.actor === identity ? {...previous,reports: previous.reports.filter(r => r.reportId !== record.reportId)} : previous)
    }
  }
  async function capture(groups: SubscriptionGroup[]) {
    // No await before this call: WeChat requires the original click gesture.
    const results = await requestSubscriptions(groups.map(group => group.id))
    if (session()?.user.id !== actor) return []
    const next = groups.slice(0,3).map(group => ({ code: group.items[0].code, platformTemplateId: group.id, result: results[group.id], reportId: newKey() }))
    setSaved({actor,reports: next})
    unpersisted.current = {actor,reports: next}
    for (const report of next) {
      storage.write(reportKey(actor,report.code),report)
      unpersisted.current.reports = unpersisted.current.reports.filter(item => item.reportId !== report.reportId)
    }
    const accepted = next.filter(report => report.result === 'accept').length
    setStatus(accepted ? `本次 ${accepted} 个微信模板各获得 1 次订阅机会。` : '本次未获得新的订阅机会。')
    if (next.some(report => report.result === 'filter')) setStatus('部分模板因标题相同被微信过滤，可到接收方式页单独订阅；其余结果正常同步。')
    return next
  }
  async function run(groups?: SubscriptionGroup[], business?: () => Promise<void>) {
    if (business) setError(null)
    if (!enabled || !actor || lock.current || pending() || groups && (!subscriptionSupported || !groups.length)) { await business?.(); return }
    if (groups && activeRequests.has(actor)) { setStatus('已有一次微信订阅正在请求，请稍后再补充。'); await business?.(); return }
    const records = currentReports()
    if (groups && records.length) {
      setSaved({actor,reports: records})
      if (!business) return
      groups = undefined
    }
    lock.current = true; setBusy(true); setError(null); setStatus('')
    if (groups) activeRequests.add(actor)
    // Capture starts in the click. Business writes run immediately; report writes wait for them.
    const captured = (groups ? capture(groups) : Promise.resolve(records)).then(value => ({records: value,error: null}), error => ({records: [],error})).finally(() => {if (groups) activeRequests.delete(actor)})
    try {
      await business?.()
      const result = await captured
      if (session()?.user.id !== actor) return
      if (result.error) throw result.error
      if (pending()) { setStatus('原操作结果待核查，订阅结果已保留，核查后可同步。'); return }
      if (result.records.some(report => items.find(item => item.code === report.code)?.platformTemplateId !== report.platformTemplateId)) {
        setStatus('有旧模板结果待处理，请在微信提醒中清除旧结果后补充。'); return
      }
      await sync(result.records,actor)
      if (session()?.user.id === actor) setStatus(previous => `${previous}订阅结果已同步，实际发送以微信校验为准。`)
    } catch (e) {
      if (session()?.user.id === actor) {
        setError(e instanceof Error ? e : new Error('订阅结果未同步，请稍后重试'))
        setStatus('还有订阅结果待同步，请先同步后再补充次数；无需重新授权。')
      }
    } finally {
      lock.current = false; setBusy(false)
      if (session()?.user.id === actor) void queries.invalidateQueries()
    }
  }
  return {busy,error,status,reports,staleReports,discardStale,subscribe: (groups: SubscriptionGroup[]) => run(groups),sync: () => run(),withAction: (groups: SubscriptionGroup[],business: () => Promise<void>) => run(groups,business)}
}
