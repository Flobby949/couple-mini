import { useSyncExternalStore } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { accentColors, badgeColors, nativeColors } from '../core/appearance'
import { switchTab } from '../platform'
import { observeTabBar, tabBarState } from '../platform/tab-bar'
import './index.scss'

const tabs = [{ key: 'home', label: '首页' }, { key: 'tasks', label: '任务' }, { key: 'shop', label: '购物' }, { key: 'me', label: '我的' }] as const
export default function CustomTabBar() {
  const state = useSyncExternalStore(observeTabBar, tabBarState)
  const colors = nativeColors[state.scheme], primary = accentColors[state.accent][state.scheme].primary
  const badge = badgeColors[state.accent][state.scheme]
  if (state.hidden) return null
  return <View className='custom-tab-bar' style={{ backgroundColor: colors.surface, borderTopColor: colors.page }}>
    {tabs.map((tab, index) => {
      const selected = state.selected === tab.key
      const count = index === 1 || index === 3 ? state.counts[index] : 0
      return <Button key={tab.key} className='custom-tab-item' ariaLabel={`${tab.label}${count ? `，${count} 个待处理事项` : ''}`} style={{ color: selected ? primary : colors.muted }} onClick={() => { if (!selected) void switchTab(`/pages/${tab.key}/index`) }}>
        <View className='custom-tab-icon'><Image className='custom-tab-image' src={`/assets/tab-icons/${tab.key}-${state.accent}-${state.scheme}${selected ? '-active' : ''}.png`}/>{count > 0 && <Text className='custom-tab-badge' style={{ color: badge.ink, borderColor: badge.line, backgroundColor: colors.surface }}>{count > 99 ? '99+' : count}</Text>}</View>
        <Text className='custom-tab-label'>{tab.label}</Text>
      </Button>
    })}
  </View>
}
