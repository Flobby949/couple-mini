import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
afterEach(()=>vi.unstubAllGlobals())
it('native queries fetch and publish results even when the runtime has no built-in AbortController',async()=>{
 vi.stubGlobal('AbortController',undefined)
 vi.stubGlobal('AbortSignal',undefined)
 const {installNativeAbortController}=await import('../src/platform/query-runtime')
 installNativeAbortController()
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const fn=vi.fn().mockResolvedValue({stage:'ready'})
 const observer=new QueryObserver(client,{queryKey:['native-context'],queryFn:fn})
 const release=observer.subscribe(()=>{})
 try{
  await vi.waitFor(()=>expect(observer.getCurrentResult().data).toEqual({stage:'ready'}),{timeout:1000})
  expect(fn).toHaveBeenCalledOnce()
 }finally{release();client.clear()}
})
it('leaves an existing native AbortController intact',async()=>{
 const original=globalThis.AbortController
 const {installNativeAbortController}=await import('../src/platform/query-runtime')
 installNativeAbortController()
 expect(globalThis.AbortController).toBe(original)
})
it('native cancellation still aborts a consumed query signal',async()=>{
 vi.stubGlobal('AbortController',undefined)
 vi.stubGlobal('AbortSignal',undefined)
 const {installNativeAbortController}=await import('../src/platform/query-runtime')
 installNativeAbortController()
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 let signal:{aborted:boolean}|undefined
 const observer=new QueryObserver(client,{queryKey:['native-cancel'],queryFn:({signal:next})=>{signal=next;return new Promise(()=>{})}})
 const release=observer.subscribe(()=>{})
 try{
  await vi.waitFor(()=>expect(signal).toBeDefined())
  await client.cancelQueries({queryKey:['native-cancel']})
  expect(signal!.aborted).toBe(true)
 }finally{release();client.clear()}
})
