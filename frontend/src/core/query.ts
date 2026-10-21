import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'
export const queries = new QueryClient({ defaultOptions: {
  queries: { staleTime: 10000, retry: (count, e) => count < 1 && e instanceof ApiError && (e.status === 0 || e.status >= 500) },
  mutations: { retry: false, networkMode: 'always' },
} })
export const keys = { context: ['context'] as const, home: ['home'] as const, rules: ['rules'] as const, history: ['history'] as const }
export function refresh() { return queries.invalidateQueries() }
