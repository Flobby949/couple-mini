import type { MoodId } from '../../contracts/checkin'
import type { Scheme } from '../../core/appearance'
import manifest from './mood-asset-manifest.json'

export const moods: ReadonlyArray<{ id: MoodId; label: string; description: string }> = [
  { id: 'happy', label: '开心', description: '普通的一天，也有小小的快乐' },
  { id: 'calm', label: '平静', description: '安安静静，按自己的节奏来' },
  { id: 'loving', label: '心动', description: '想到你，嘴角就偷偷上扬' },
  { id: 'missing', label: '想你', description: '今天，也想离你近一点' },
  { id: 'tired', label: '疲惫', description: '有点累了，给自己歇一会儿' },
  { id: 'sad', label: '低落', description: '不太开心的日子，也可以记下来' },
  { id: 'irritated', label: '烦躁', description: '心里有点乱，慢慢缓一缓' },
  { id: 'energetic', label: '元气', description: '电量满格，想和你分享今天' },
]
export function moodOption(id: unknown) { return moods.find(mood => mood.id === id) }
export function moodAsset(id: MoodId, scheme: Scheme) {
  const file = manifest.files[id][scheme]
  return { ...file, id, scheme, revision: manifest.revision, url: `${API_BASE.replace(/\/api\/v1\/?$/, '')}/assets/moods/${manifest.revision}/${file.path}` }
}
