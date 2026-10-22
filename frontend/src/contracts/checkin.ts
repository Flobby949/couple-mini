export type MoodId = 'happy' | 'calm' | 'loving' | 'missing' | 'tired' | 'sad' | 'irritated' | 'energetic'
export interface CheckinEntry { mood: MoodId | null; checkedAt: string }
export interface MoodAsset { id: MoodId; scheme: 'light' | 'dark'; revision: string; url: string; bytes: number }
export interface CheckinDay { date: string; me: CheckinEntry | null; partner: CheckinEntry | null }
export interface CheckinCalendar {
  month: string
  firstMonth: string
  businessDate: string
  serverTime: string
  revision: number
  days: CheckinDay[]
}
