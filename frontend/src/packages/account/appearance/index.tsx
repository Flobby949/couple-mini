import { useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useTheme } from '../../../app/theme'
import { accents, type Appearance, type ColorMode } from '../../../core/appearance'
import { ErrorState } from '../../../ui'
import { useArtwork } from '../../../ui/use-artwork'

const modes: { value: ColorMode; label: string; description: string }[] = [
  { value: 'system', label: '跟随系统', description: '随设备自动切换' },
  { value: 'light', label: '浅色', description: '清亮的日常' },
  { value: 'dark', label: '深色', description: '柔和的夜晚' },
]
export default function AppearancePage() {
  const { pointsJar } = useArtwork()
  const theme = useTheme(), [error, setError] = useState<Error | null>(null)
  function choose(next: Appearance) { try { theme.setAppearance(next); setError(null) } catch { setError(new Error('外观未能保存，请重试')) } }
  return <Page title='喜欢的颜色，舒服的光' subtitle='即时预览，自动保存在这台设备。'>
    <ErrorState error={error} />
    <Text className='section-title section-heading'>明暗模式</Text>
    <View className='appearance-options'>{modes.map(mode => <Button className={`appearance-choice ${theme.appearance.mode === mode.value ? 'is-selected' : ''}`} key={mode.value} ariaLabel={`${mode.label}${theme.appearance.mode === mode.value ? '，已选中' : ''}`} onClick={() => choose({ ...theme.appearance, mode: mode.value })}><Text className='section-title'>{mode.label}</Text><Text className='muted'>{mode.description}</Text><Text className='choice-status'>{theme.appearance.mode === mode.value ? '✓ 已选中' : '选择'}</Text></Button>)}</View>
    <Text className='section-title section-heading'>主题色</Text>
    <View className='accent-options'>{accents.map(accent => <Button className={`accent-choice ${theme.appearance.accent === accent.value ? 'is-selected' : ''}`} key={accent.value} ariaLabel={`${accent.label}${theme.appearance.accent === accent.value ? '，已选中' : ''}`} onClick={() => choose({ ...theme.appearance, accent: accent.value })}><View className='accent-swatch' style={{ backgroundColor: accent.sample }} /><Text>{accent.label}</Text><Text className='choice-status'>{theme.appearance.accent === accent.value ? '✓ 已选中' : '选择'}</Text></Button>)}</View>
    <View className='surface appearance-preview'><View className='row'><Image className='pool-jar' src={pointsJar} mode='aspectFit' ariaHidden /><Text className='section-title'>这是你的日常</Text></View><Text className='muted'>按钮、选中状态、导航和插画会使用这份颜色。积分与业务规则保持原来的约定。</Text><Text className='tag'>当前外观</Text><View className='preview-action'>两个人，刚刚好</View></View>
  </Page>
}
