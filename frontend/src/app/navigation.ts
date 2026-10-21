import type { Context } from '../contracts/api'
import { home, redirect, switchTab } from '../platform'

type Target = { path: string; id?: string }
let target: Target | undefined
const tabs = ['pages/home/index', 'pages/tasks/index', 'pages/shop/index', 'pages/me/index']
export function rememberTarget(path: string, id?: string) {
  path = path.replace(/^\//, '')
  if (tabs.includes(path) || path === 'packages/account/history/index' || path === 'packages/account/rules/index') {
    target = { path, ...(path === 'packages/account/rules/index' && id && /^[a-f0-9]{32}$/.test(id) ? { id } : {}) }
  }
  if (['packages/commerce/store/index','packages/commerce/product-edit/index','packages/commerce/product/index','packages/commerce/checkout/index','packages/commerce/orders/index','packages/commerce/order-detail/index','packages/account/points/index'].includes(path)) {
    target = { path, ...(id && /^[a-f0-9]{32}$/.test(id) ? { id } : {}) }
  }
}
export async function routeContext(context: Context) {
  if (context.stage === 'binding') return redirect('/packages/account/binding/index')
  if (context.stage === 'rules') return redirect(`/packages/account/rules/index${target?.id ? `?id=${target.id}` : ''}`)
  const destination = target; target = undefined
  if (!destination) return home()
  if (tabs.includes(destination.path)) return switchTab('/' + destination.path)
  return redirect(`/${destination.path}${destination.id ? `?id=${destination.id}` : ''}`)
}
