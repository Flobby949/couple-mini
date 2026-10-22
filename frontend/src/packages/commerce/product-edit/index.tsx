import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getProduct, saveProduct } from '../../../features/catalog/api'
import { Cover } from '../../../features/catalog/components'
import { chooseProductCover } from '../../../platform/media'
import { uploadMedia } from '../../../core/media'
import { parsePoints, parseStock } from '../../../core/values'
import { keys } from '../../../core/query'
import { useAction } from '../../../core/use-action'
import { back } from '../../../platform'
import { Icon } from '../../../ui/visual'
import { ErrorState, Loading, Notice } from '../../../ui'
import type { Product } from '../../../contracts/commerce'
import { session } from '../../../core/api'

export default function ProductEdit() {
  const gate = useGate(), id = useRouter().params.id
  const query = useQuery({ queryKey: keys.product(id || ''), queryFn: () => getProduct(id!), enabled: gate.allowed && !!id, staleTime: 0 })
  const owned = !id || query.data?.product.ownerId === gate.data?.me.id
  const authenticated = gate.data?.stage === 'ready' && session()?.user.id === gate.data.me.id
  return <Page title={id ? '编辑这份心意' : '新建一份心意'} subtitle='每一份约定，都由你亲自决定。'>
    <ErrorState error={gate.error || query.error} retry={() => { void gate.refetch(); if (id) void query.refetch() }} />
    {!authenticated || id && (!query.data || !query.isFetchedAfterMount) ? <Loading /> : !owned ? <Notice>只能编辑自己的商品。</Notice> : <ProductForm key={id || 'new'} product={query.data?.product} canSubmit={gate.allowed} />}
  </Page>
}

// Mount with the first snapshot. Background refreshes never overwrite the user's draft.
function ProductForm({ product, canSubmit }: { product?: Product; canSubmit: boolean }) {
  const id = product?.id
  const [form, set] = useState(() => ({ name: product?.name || '', description: product?.description || '', price: product ? String(product.price) : '', stock: product ? String(product.stock) : '', coverId: product?.coverId || '' }))
  const [localCover, setLocalCover] = useState(''), [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState<Error | null>(null)
  const action = useAction()
  const price = parsePoints(form.price), stock = parseStock(form.stock)
  const numberDisabled = !canSubmit || action.busy
  const valid = form.name.trim().length > 0 && price !== null && stock !== null && !!form.coverId
  function adjustNumber(field: 'price' | 'stock', delta: number) {
    if (numberDisabled) return
    set(current => {
      const raw = current[field], parsed = field === 'price' ? parsePoints(raw) : parseStock(raw)
      if (raw !== '' && parsed === null) return current
      const max = field === 'price' ? 1_000_000_000 : 1_000_000
      return { ...current, [field]: String(Number(Math.min(max, Math.max(0, Number(raw) + delta)).toFixed(6))) }
    })
  }
  async function upload(path: string) {
    setUploading(true); setUploadError(null)
    try { const fileId = await uploadMedia(path); set(current => ({ ...current, coverId: fileId })) }
    catch (e) { setUploadError(e instanceof Error ? e : new Error('上传失败，请重试')) }
    finally { setUploading(false) }
  }
  async function choose() {
    try { const path = await chooseProductCover(); setLocalCover(path); set(current => ({ ...current, coverId: '' })); await upload(path) }
    catch (e) { if (e instanceof Error && !e.message.includes('cancel')) setUploadError(e) }
  }
  function save() { if (canSubmit) void action.run(() => saveProduct(id, { ...form, stock: parseStock(form.stock)! }), async () => { await back('/packages/commerce/store/index') }) }
  return <View className='surface form'>
      <ErrorState error={action.error} />
      <Text className='section-title'>商品封面（必选）</Text>
      <View className={`cover-editor${localCover||form.coverId?' has-cover':''}`}>{localCover?<Image className='edit-cover' src={localCover} mode='aspectFit'/>:form.coverId?<Cover fileId={form.coverId} name={form.name||'商品'} large mode='aspectFit'/>:<View className='cover-empty'><Icon name='image' tone='primary' size={38}/><Text className='muted'>为这份心意选一张封面</Text></View>}<Button className={localCover||form.coverId?'text-button cover-change':'button secondary'} loading={uploading} disabled={!canSubmit||uploading||action.busy} onClick={()=>void choose()}>{localCover||form.coverId?'更换照片':'选择一张封面'}</Button></View><Text className='muted'>{process.env.TARO_ENV==='weapp'?'选择后可裁切为正方形。':''}PNG 或 JPEG，最多 5 MiB，宽高不超过 4096 像素。</Text>
      <ErrorState error={uploadError} retry={localCover ? () => void upload(localCover) : undefined} />
      <Text className='field-label'>商品名称</Text><Input className='input' ariaLabel='商品名称' maxlength={80} placeholder='例如，一起散步半小时' value={form.name} onInput={e => set({ ...form, name: e.detail.value })} />
      <Text className='field-label'>积分价格</Text><View className='form-inline'><View className='product-stepper'>
        <Button className='stepper-button' ariaLabel='减少积分价格' disabled={numberDisabled || price === null || Number(form.price) <= 0} onClick={() => adjustNumber('price', -1)}>−</Button>
        <Input className='input' ariaLabel='积分价格' type='digit' placeholder='允许 0 积分' value={form.price} disabled={numberDisabled} onInput={e => set(current => ({ ...current, price: e.detail.value }))} />
        <Button className='stepper-button' ariaLabel='增加积分价格' disabled={numberDisabled || form.price !== '' && (price === null || Number(form.price) >= 1_000_000_000)} onClick={() => adjustNumber('price', 1)}>＋</Button>
      </View><Text className='muted'>积分</Text></View><Text className='muted'>{price === null ? '请输入 0–1000000000 的数字，最多六位小数，四舍五入取整。' : `取整后 ${price} 积分`}</Text>
      <Text className='field-label'>库存</Text><View className='form-inline'><View className='product-stepper'>
        <Button className='stepper-button' ariaLabel='减少库存' disabled={numberDisabled || stock === null || stock <= 0} onClick={() => adjustNumber('stock', -1)}>−</Button>
        <Input className='input' ariaLabel='可兑换库存' type='number' placeholder='0–1000000' value={form.stock} disabled={numberDisabled} onInput={e => set(current => ({ ...current, stock: e.detail.value }))} />
        <Button className='stepper-button' ariaLabel='增加库存' disabled={numberDisabled || form.stock !== '' && (stock === null || stock >= 1_000_000)} onClick={() => adjustNumber('stock', 1)}>＋</Button>
      </View><Text className='muted'>份</Text></View>
      <Text className='field-label'>描述与兑现说明</Text><Textarea className='textarea' ariaLabel='描述与兑现说明' maxlength={2000} placeholder='说说这份心意，以及你们希望如何兑现。' value={form.description} onInput={e => set({ ...form, description: e.detail.value })} />
      {id && <Text className='muted'>编辑商品不会改变已有订单的名称、封面、积分价和兑现约定。</Text>}
      <Button className='button' loading={action.busy} disabled={!canSubmit || !valid || uploading || action.busy} onClick={save}>保存商品</Button>
    </View>
}
