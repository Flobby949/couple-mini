import { Picker, Text, View } from '@tarojs/components'
import { beijingDeadline, beijingTimeSeconds } from '../core/values'

export function BeijingDateTime({ date, time, onDate, onTime, disabled = false, original }: { date: string; time: string; onDate: (value: string) => void; onTime: (value: string) => void; disabled?: boolean; original?: string }) {
  const full = original || beijingDeadline(date, time)
  return <View className='date-time-field'><View className='date-time-pickers'>
    <Picker mode='date' value={date} disabled={disabled} onChange={e => onDate(e.detail.value)}><View className='date-picker-value' role='button' ariaLabel='选择北京时间日期'>{date || '选择日期'}</View></Picker>
    <Picker mode='time' value={time} disabled={disabled} onChange={e => onTime(e.detail.value)}><View className='date-picker-value' role='button' ariaLabel='选择北京时间时分'>{time || '选择时分'}</View></Picker>
  </View><Text className='muted'>{full ? `${beijingTimeSeconds(full)} 北京时间` : '选择到分钟，秒为 00；提交须严格早于截止时刻。'}</Text></View>
}
