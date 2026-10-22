import { useEffect, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { MoodId } from '../../contracts/checkin'
import { useTheme } from '../../app/theme'
import { cachedMood, forgetMood, loadMood } from '../../platform/mood-cache'
import { moodAsset, moodOption } from './moods'

export function MoodImage({ mood, size, decorative = false }: { mood: MoodId; size: number; decorative?: boolean }) {
  const { scheme } = useTheme(), asset = moodAsset(mood, scheme), label = moodOption(mood)!.label
  const [attempt, retry] = useState(0)
  const [state, set] = useState<{ key: string; mood: MoodId; path?: string; error?: boolean }>(() => ({ key: asset.url, mood, path: cachedMood(asset) }))
  useEffect(() => {
    let active = true
    void loadMood(asset).then(path => { if (active) set({ key: asset.url, mood, path }) }, () => { if (active) set({ key: asset.url, mood, error: true }) })
    return () => { active = false }
  }, [mood, scheme, attempt])
  const current = state.key === asset.url
  const path = cachedMood(asset) || (state.mood === mood ? state.path : undefined)
  const failed = current && state.error
  return <View className={`mood-image ${failed ? 'mood-image-failed' : ''}`} style={{ width: Taro.pxTransform(size), height: Taro.pxTransform(size) }} ariaHidden={decorative} ariaLabel={decorative ? undefined : `${label}${failed ? '，图片暂未加载，点击重试' : ''}`} onClick={failed ? () => { forgetMood(asset); retry(value => value + 1) } : undefined}>
    {path && !failed ? <Image key={path} className='mood-image-pixels' src={path} mode='aspectFit' ariaHidden onError={() => { forgetMood(asset); set({ key: asset.url, mood, error: true }) }}/> : <Text className='mood-image-placeholder'>{label}</Text>}
  </View>
}
