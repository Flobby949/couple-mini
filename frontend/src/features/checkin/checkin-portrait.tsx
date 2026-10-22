import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { User } from '../../contracts/api'
import type { CheckinEntry } from '../../contracts/checkin'
import { Avatar } from '../../ui/visual'
import { useArtwork } from '../../ui/use-artwork'
import { MoodImage } from './mood-image'
import { moodOption } from './moods'

export function CheckinPortrait({ user, partnerId, checked, entry }: { user: User; partnerId: string; checked: boolean; entry?: CheckinEntry | null }) {
  const { avatarFrame } = useArtwork(), mood = moodOption(entry?.mood)
  if (!checked || !mood) return <Avatar user={user} partnerId={partnerId} size={112} stitched checked={checked}/>
  return <View className={`portrait portrait-stitched checkin-mood-portrait ${user.id < partnerId ? '' : 'portrait-blue'}`} style={{ width: Taro.pxTransform(112), height: Taro.pxTransform(112) }} ariaLabel={`${user.nickname}，${mood.label}，已签到`}>
    <MoodImage mood={mood.id} size={96} decorative/>
    <Image className='portrait-frame' src={avatarFrame} mode='aspectFit' ariaHidden/>
    <View className='portrait-state is-checked'><Text>✓</Text></View>
  </View>
}
