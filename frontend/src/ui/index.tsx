import { type PropsWithChildren } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'

export function Notice({ children }: PropsWithChildren) { return <View className='notice' role='alert'>{children}</View> }
export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  if (!error) return null
  return <Notice><Text>{error.message}</Text>{retry && <Button className='button secondary' onClick={retry}>重新读取</Button>}</Notice>
}
export function Loading() { return <View className='loading' role='status'>正在读取我们的日常…</View> }
export function Empty({ title, description, image }: { title: string; description: string; image?: string }) {
  return <View className='empty'>{image && <Image className='empty-image' src={image} mode='aspectFit' />}<Text className='section-title'>{title}</Text><Text className='muted'>{description}</Text></View>
}
