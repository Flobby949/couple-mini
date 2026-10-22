import { useEffect, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { MoodId } from '../../contracts/checkin'
import { hideTabBar, showTabBar } from '../../platform/tab-bar'
import { ErrorState } from '../../ui'
import { moods, moodOption } from './moods'
import { MoodImage } from './mood-image'

export function MoodPicker({ busy, blocked = false, error, close, confirm }: { busy: boolean; blocked?: boolean; error: Error | null; close: () => void; confirm: (mood: MoodId) => void }) {
  const [selected, setSelected] = useState<MoodId>()
  const current = moodOption(selected)
  useEffect(() => {
    void hideTabBar({ animation: false }).catch(() => {})
    return () => { void showTabBar({ animation: false }).catch(() => {}) }
  }, [])
  return <View className='sheet-backdrop mood-backdrop' onClick={() => { if (!busy || error) close() }}>
    <View className='sheet mood-sheet' role='dialog' ariaLabel='选择今天的心情' onClick={event => event.stopPropagation()}>
      <Button className='mood-sheet-close' ariaLabel='关闭心情选择' disabled={busy && !error} onClick={close}><Text>×</Text></Button>
      <View className='mood-sheet-heading'><Text className='mood-sheet-title'>今天，是什么心情？</Text><Text className='muted'>挑一个小表情，记录此刻的你</Text></View>
      <ScrollView scrollY showScrollbar={false} className='mood-picker-scroll'>
        <View className='mood-preview' role='status'>
          <View className='mood-preview-circle'><MoodImage mood={selected || 'happy'} size={176} decorative/></View>
          <Text className='mood-preview-label'>{current?.label || '选一个此刻的你'}</Text>
          <Text className='mood-preview-description'>{current?.description || '点击下面的小团子，选好再签到'}</Text>
        </View>
        <View className='mood-options' role='group' ariaLabel='八种预设心情'>
          {moods.map(mood => <Button key={mood.id} className={`mood-option ${selected === mood.id ? 'selected' : ''}`} disabled={busy || blocked} ariaLabel={`${mood.label}${selected === mood.id ? '，已选中' : ''}`} onClick={() => setSelected(mood.id)}>
            <MoodImage mood={mood.id} size={64} decorative/><Text className='mood-option-label'>{mood.label}</Text>
            {selected === mood.id && <Text className='mood-option-tick'>✓</Text>}
          </Button>)}
        </View>
      </ScrollView>
      <ErrorState error={error}/>
      <Button className='button mood-confirm' disabled={!selected || busy || blocked} loading={busy && !error} onClick={() => { if (selected && !blocked) confirm(selected) }}>{blocked && error ? '请先核查签到结果' : selected ? '用这个心情签到' : '先选一个心情'}</Button>
      <Text className='mood-sheet-footnote'>签到后，心情会留在日历里</Text>
    </View>
  </View>
}
