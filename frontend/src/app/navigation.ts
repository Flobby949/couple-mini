import type { MessageTarget } from '../contracts/notifications'
import { targetRoute } from '../features/notifications/presentation'
import type { Context } from '../contracts/api'
import { home, navigate, redirect, switchTab } from '../platform'

type Target = { path: string; id?: string; code?: string }
let target: Target | undefined
const tabs = ['pages/home/index', 'pages/tasks/index', 'pages/shop/index', 'pages/me/index']
export function rememberTarget(path: string, id?: string, code?: string) {
  path = path.split('?')[0].replace(/^\//, '')
  if (tabs.includes(path) || path === 'packages/account/history/index' || path === 'packages/account/checkin-calendar/index' || path === 'packages/account/rules/index') {
    target = { path, ...(path === 'packages/account/rules/index' && id && /^[a-f0-9]{32}$/.test(id) ? { id } : {}) }
  }
  if (['packages/commerce/store/index','packages/commerce/product-edit/index','packages/commerce/product/index','packages/commerce/checkout/index','packages/commerce/orders/index','packages/commerce/order-detail/index','packages/account/milestones/index','packages/account/points/index','packages/account/partner/index','packages/account/gift/index','packages/account/gift-detail/index','packages/tasks/edit/index','packages/tasks/detail/index','packages/account/messages/index','packages/account/message-detail/index','packages/account/notification-settings/index','packages/account/notification-template/index'].includes(path)) {
    target = { path, ...(path === 'packages/account/notification-template/index' && code && /^[OTPR]\d{2}$/.test(code) ? {code} : {}), ...(id && /^[a-f0-9]{32}$/.test(id) ? { id } : {}) }
  }
}
export async function routeContext(context: Context) {
  if (context.stage === 'binding') return redirect('/packages/account/binding/index')
  if (context.stage === 'rules') return redirect(`/packages/account/rules/index${target?.path === 'packages/account/rules/index' && target.id ? `?id=${target.id}` : ''}`)
  const destination = target; target = undefined
  if (!destination) return home()
  if (tabs.includes(destination.path)) return switchTab('/' + destination.path)
  return redirect(`/${destination.path}${destination.id ? `?id=${destination.id}` : destination.code ? `?code=${destination.code}` : ''}`)
}

export async function openTarget(target: MessageTarget) { const route = targetRoute(target); if (!route) throw new Error('消息入口不可用'); return route.tab ? switchTab(route.path) : navigate(route.path) }
