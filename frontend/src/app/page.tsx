import { useEffect, type PropsWithChildren } from 'react'
import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { Recovery } from './recovery'
import { useTheme } from './theme'
import { applyNativeTheme } from '../platform/theme'

export function Page({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const { scheme, appearance } = useTheme()
  useEffect(() => applyNativeTheme(scheme, appearance.accent), [scheme, appearance.accent])
  useDidShow(() => applyNativeTheme(scheme, appearance.accent))
  return <View className={`theme-root theme-${scheme} accent-${appearance.accent}`}><View className='page'><View className='page-heading'><Text className='page-title'>{title}</Text>{subtitle && <Text className='muted'>{subtitle}</Text>}</View><Recovery />{children}</View></View>
}
