import { useEffect, type PropsWithChildren } from 'react'
import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { MessageEntry } from '../features/notifications/entry'
import { Recovery } from './recovery'
import { useTheme } from './theme'
import { applyNativeTheme } from '../platform/theme'

export function Page({ title, subtitle, children, messageEntry = false }: PropsWithChildren<{ title: string; subtitle?: string; messageEntry?: boolean }>) {
  const { scheme, appearance } = useTheme()
  useEffect(() => applyNativeTheme(scheme, appearance.accent), [scheme, appearance.accent])
  useDidShow(() => applyNativeTheme(scheme, appearance.accent))
  return <View className={`theme-root theme-${scheme} accent-${appearance.accent}`}><View className='page'>{messageEntry && <MessageEntry />}<View className='page-heading'><Text className='page-title'>{title}</Text>{subtitle && <Text className='muted'>{subtitle}</Text>}</View><Recovery />{children}</View></View>
}
