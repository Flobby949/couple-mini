import { type PropsWithChildren } from 'react'
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { onUnauthorized } from './core/api'
import { queries } from './core/query'
import { redirect, storage } from './platform'
import { ThemeProvider } from './app/theme'
import { clearMedia } from './core/media'
import { clearCheckoutPrice } from './features/orders/checkout-intent'
import './styles/app.scss'

onlineManager.setEventListener(setOnline => {
  const handler = (e: { isConnected: boolean }) => setOnline(e.isConnected)
  Taro.onNetworkStatusChange(handler)
  return () => Taro.offNetworkStatusChange(handler)
})
onUnauthorized(() => {
  storage.remove('session')
  queries.clear()
  clearMedia()
  clearCheckoutPrice()
  void redirect('/pages/entry/index')
})
export default function App({ children }: PropsWithChildren) {
  useDidShow(() => { focusManager.setFocused(true); void queries.invalidateQueries() })
  useDidHide(() => focusManager.setFocused(false))
  return <QueryClientProvider client={queries}><ThemeProvider>{children}</ThemeProvider></QueryClientProvider>
}
