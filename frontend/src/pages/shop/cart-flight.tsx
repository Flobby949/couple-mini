import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Taro, { useDidHide } from '@tarojs/taro'
import { View, type ITouchEvent } from '@tarojs/components'
import { Icon } from '../../ui/visual'

type Point = { x: number; y: number }
type Flight = { id: number; from: Point; to: Point; arrived?: boolean }
const duration = 560

export function useCartFlight() {
  const [flight, setFlight] = useState<Flight>()
  const sequence = useRef(0), timer = useRef<ReturnType<typeof setTimeout>>()
  const stop = () => { sequence.current++; if (timer.current !== undefined) clearTimeout(timer.current); timer.current = undefined }
  const cancel = () => { stop(); setFlight(undefined) }
  useDidHide(cancel)
  useEffect(() => stop, [])

  function prepare(id: string, event: ITouchEvent) {
    cancel()
    const ticket = sequence.current, touch = event.changedTouches?.[0] || event.touches?.[0]
    const pointer = touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY) ? { x: touch.clientX, y: touch.clientY } : undefined
    // Capture viewport coordinates at the tap, before the request or a refresh can move the card.
    const position = new Promise<Flight | undefined>(resolve => {
      try {
        const query = Taro.createSelectorQuery()
        query.select(`#cart-add-${id}`).boundingClientRect()
        query.select('#shop-cart-target').boundingClientRect()
        query.exec(([source, target]) => {
          if (!source?.width || !target?.width) { resolve(undefined); return }
          resolve({ id: ticket, from: pointer || { x: source.left + source.width / 2, y: source.top + source.height / 2 }, to: { x: target.left + target.width / 2, y: target.top + target.height / 2 } })
        })
      } catch { resolve(undefined) }
    })
    return async () => {
      const next = await position
      if (!next || ticket !== sequence.current) return
      setFlight(next)
      timer.current = setTimeout(() => {
        setFlight({ ...next, arrived: true })
        timer.current = setTimeout(() => setFlight(undefined), 180)
      }, duration)
    }
  }
  return { flight: flight?.arrived ? undefined : flight, receiving: !!flight?.arrived, prepare, cancel }
}

export function CartFlight({ flight }: { flight: Flight }) {
  const style = { left: `${flight.from.x}px`, top: `${flight.from.y}px`, '--cart-flight-x': `${flight.to.x - flight.from.x}px`, '--cart-flight-y': `${flight.to.y - flight.from.y}px`, '--cart-flight-duration': `${duration}ms` } as CSSProperties
  return <View key={flight.id} className='cart-flight' style={style} ariaHidden><View className='cart-flight-x'><View className='cart-flight-y'><View className='cart-flight-token'><Icon name='cart' tone='primary' size={20}/></View></View></View></View>
}
