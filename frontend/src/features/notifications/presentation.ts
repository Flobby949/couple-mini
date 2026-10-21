import type { Channel, MessageTarget } from '../../contracts/notifications'
export const channelNames: Record<Channel,string> = { in_app: '仅站内', wechat: '仅微信', both: '站内和微信', off: '全部关闭' }
export const authorizationNames: Record<string,string> = { none: '尚未报告授权', accept: '已报告接受订阅', reject: '已拒绝订阅', ban: '平台禁止订阅', filter: '模板被平台过滤', fail: '本次未完成授权' }
export const deliveryNames: Record<string,string> = { pending: '等待发送', claimed: '准备发送', sending: '正在发送', succeeded: '微信接口已确认发送', retry: '明确失败，等待重试', unavailable: '本次不可投递', unknown: '发送结果未知，待核查', failed: '重试已停止' }
export const deliveryReasons: Record<string,string> = { template_unmapped:'尚未配置对应微信模板', wechat_not_configured:'尚未配置微信服务', development_identity:'开发身份无法接收微信订阅', no_authorization:'没有可用订阅机会', subscription_unavailable:'平台拒绝或订阅机会已失效', template_or_page_invalid:'平台模板字段或页面不匹配', platform_rejected:'微信明确拒绝本次投递', platform_busy:'微信繁忙，稍后重试', send_result_unknown:'请求已发出，未取得确定结果', send_response_unknown:'微信响应无法确认', process_stopped_during_send:'发送期间进程退出，需核查', retry_exhausted:'已达到自动重试次数', invalid_credentials:'微信服务凭据不可用', token_expired:'正在刷新微信服务凭据', credential_request_failed:'获取微信服务凭据失败', credential_response_failed:'微信凭据响应不可用', credential_busy:'微信凭据服务繁忙', claim_lease_expired:'发送准备中断，已恢复排队' }
export function targetRoute(target: MessageTarget): {path: string; tab?: boolean} | undefined {
  const id = /^[a-f0-9]{32}$/.test(target.id)
  if (target.type === 'home') return { path: '/pages/home/index', tab: true }
  if (target.type === 'partner') return { path: '/packages/account/partner/index' }
  if (!id) return
  if (target.type === 'order') return { path: `/packages/commerce/order-detail/index?id=${target.id}` }
  if (target.type === 'task') return { path: `/packages/tasks/detail/index?id=${target.id}` }
  if (target.type === 'gift') return { path: `/packages/account/gift-detail/index?id=${target.id}` }
  if (target.type === 'rules') return { path: `/packages/account/rules/index?id=${target.id}` }
}
