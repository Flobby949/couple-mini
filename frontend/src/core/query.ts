import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'
export const queries = new QueryClient({ defaultOptions: {
  queries: { staleTime: 10000, retry: (count, e) => count < 1 && e instanceof ApiError && (e.status === 0 || e.status >= 500) },
  mutations: { retry: false, networkMode: 'always' },
} })
export const keys = {
  context: ['context'] as const, home: ['home'] as const, rules: ['rules'] as const, history: ['history'] as const,
  catalog: (view: string) => ['catalog', view] as const, product: (id: string) => ['product', id] as const,
  cart: ['cart'] as const, orders: (role: string, status: string) => ['orders', role, status] as const,
  order: (id: string) => ['order', id] as const, accountHistory: ['account-history'] as const,
  tasks: (kind: string, filter: string) => ['tasks', kind, filter] as const,
  task: (id: string) => ['task', id] as const, giftPreview: ['gift-preview'] as const,
  gifts: ['gifts'] as const, gift: (id: string) => ['gift', id] as const, reservations: ['reservations'] as const,
}
export function refresh() { return queries.invalidateQueries() }
