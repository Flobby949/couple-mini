import { useState } from 'react'
import { refresh } from './query'

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  async function run<T>(fn: () => Promise<T>, done?: (result: T) => void | Promise<void>) {
    if (busy) return
    setBusy(true); setError(null)
    try { const result = await fn(); await refresh(); await done?.(result) }
    catch (e) { setError(e instanceof Error ? e : new Error('操作暂未完成，请重试')); await refresh() }
    finally { setBusy(false) }
  }
  return { busy, error, run }
}
