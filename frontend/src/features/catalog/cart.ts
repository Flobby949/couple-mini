import { useSyncExternalStore } from 'react'
import { session } from '../../core/api'
import { storage } from '../../platform'
import type { Product } from '../../contracts/commerce'

type CartState = { key: string; items: Product[]; error: Error | null }
let state: CartState | undefined
const listeners = new Set<() => void>()
const notify = () => { for (const listener of listeners) listener() }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function snapshot(): CartState {
  const user = session()?.user.id, key = user ? `cart-v1:${API_BASE}:${user}` : ''
  if (state?.key !== key) {
    try {
      const saved = key ? storage.read<Product[]>(key) : undefined
      state = { key, items: Array.isArray(saved) ? saved : [], error: null }
    } catch { state = { key, items: [], error: new Error('本地购物车读取失败，请重试') } }
  }
  return state
}
function update(change: (items: Product[]) => Product[]) {
  if (state?.error) state = undefined
  const current = snapshot()
  try {
    if (!current.key) throw new Error('请先登录')
    if (current.error) throw current.error
    const items = change(current.items)
    storage.write(current.key, items)
    state = { ...current, items, error: null }
  } catch { state = { ...current, error: new Error('本地购物车保存失败，请重试') } }
  notify()
  return !state.error
}
export function addCart(product: Product) {
  return update(items => {
    if (product.ownerId === session()?.user.id) throw new Error('不能加入自己的商品')
    return items.some(item => item.id === product.id) ? items.map(item => item.id === product.id ? product : item) : [product, ...items]
  })
}
export function removeCart(id: string) { return update(items => items.filter(item => item.id !== id)) }
function retry() { state = undefined; notify() }
export function useCart() {
  const current = useSyncExternalStore(subscribe, snapshot)
  return { items: current.items, error: current.error, add: addCart, remove: removeCart, retry }
}
