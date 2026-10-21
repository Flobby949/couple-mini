import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { pending, recover } from '../core/operations'
import { useAction } from '../core/use-action'
import { ErrorState } from '../ui'

export function Recovery() {
  const [record, setRecord] = useState(pending)
  const [message, setMessage] = useState('')
  const action = useAction()
  useDidShow(() => { setRecord(pending()); if (pending()) void check(false) })
  // A page mutation re-renders its Page wrapper, so the storage fact remains authoritative.
  const current = pending() || record
  async function check(close: boolean) {
    await action.run(() => recover(close), result => {
      if (!result) { setRecord(undefined); return }
      if (result.status === 'absent') { setMessage('暂未查到结果。请再次核查，或关闭这笔尚未执行的操作。'); return }
      setRecord(undefined)
      if (result.status === 'succeeded') setMessage('原操作已成功，请以刷新后的当前状态为准。')
      else if (result.status === 'closed') setMessage('原操作已关闭，确认未执行。可以重新操作。')
      else setMessage('原操作未生效，请检查输入后重新操作。')
    })
  }
  if (!current && !message && !action.error) return null
  return <View className='recovery'><Text className='section-title'>{current ? '有一笔操作结果待确认' : '操作结果已核查'}</Text><Text>{message || '网络响应可能中断，请先核查，避免重复操作。'}</Text><ErrorState error={action.error} />{current && <View className='actions'><Button className='button' loading={action.busy} disabled={action.busy} onClick={() => void check(false)}>核查结果</Button><Button className='button secondary' disabled={action.busy} onClick={() => void check(true)}>关闭未执行操作</Button></View>}</View>
}
