import { Button, Image, Text, View } from '@tarojs/components'
import { useMedia } from '../../core/media'
import type { Product, Snapshot } from '../../contracts/commerce'

export function Cover({ fileId, name, large = false }: { fileId: string; name: string; large?: boolean }) {
  const media = useMedia(fileId)
  const className = `cover ${large ? 'cover-large' : ''}`
  if (media.path) return <Image className={className} ariaLabel={`${name}的封面`} src={media.path} mode='aspectFill' onError={media.invalidate} />
  return <Button className={`${className} cover-placeholder`} disabled={!media.error} onClick={media.retry}>{media.error ? '图片加载失败，点击重试' : '正在读取封面…'}</Button>
}
export function ProductSummary({ product, stock }: { product: Pick<Product, 'name' | 'price' | 'coverId'> | Snapshot; stock?: number }) {
  return <View className='product-summary'><Cover fileId={product.coverId} name={product.name} /><View className='product-copy'><Text className='section-title'>{product.name}</Text><Text className='price'>{product.price} <Text className='points-unit'>积分</Text></Text>{stock !== undefined && <Text className='muted'>{stock > 0 ? `库存 ${stock} 份` : '暂无库存'}</Text>}</View></View>
}
