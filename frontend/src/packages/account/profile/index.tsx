import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Form, Image, Input, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useVisible } from '../../../app/hooks'
import { session } from '../../../core/api'
import { keys } from '../../../core/query'
import { uploadMedia } from '../../../core/media'
import { useAction } from '../../../core/use-action'
import { getContext, saveProfile } from '../../../features/identity/api'
import { back, redirect } from '../../../platform'
import { chooseCover } from '../../../platform/media'
import { ErrorState, Loading } from '../../../ui'
import { Avatar } from '../../../ui/visual'
import type { User } from '../../../contracts/api'

export default function ProfilePage() {
  const visible = useVisible()
  const context = useQuery({ queryKey: keys.context, queryFn: getContext, enabled: visible && !!session() })
  useEffect(() => { if (visible && !session()) void redirect('/pages/entry/index') }, [visible])
  const state = context.data
  const fallback = state?.stage === 'binding' ? '/packages/account/binding/index' : state?.stage === 'rules' ? '/packages/account/rules/index' : '/pages/me/index'
  return <Page title='我的资料' onBack={() => void back(fallback)}>
    <ErrorState error={context.error} retry={() => void context.refetch()}/>
    {!visible || !state || state.me.id !== session()?.user.id ? <Loading/> : <ProfileForm key={state.me.id} user={state.me} partnerId={state.partner?.id || '~'}/>}
  </Page>
}

// Mount once per account; a background refresh must not replace an unsaved draft.
function ProfileForm({ user, partnerId }: { user: User; partnerId: string }) {
  const action = useAction()
  const [nickname, setNickname] = useState(user.nickname === '微信用户' ? '' : user.nickname)
  const [avatarId, setAvatarId] = useState(user.avatarId || ''), [localAvatar, setLocalAvatar] = useState('')
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState<Error | null>(null)
  const [saved, setSaved] = useState(false)
  const disabled = uploading || action.busy
  async function upload(path: string) {
    if (!path || disabled) return
    setLocalAvatar(path); setAvatarId(''); setSaved(false); setUploading(true); setUploadError(null)
    try { setAvatarId(await uploadMedia(path, 'avatar')) }
    catch (e) { setUploadError(e instanceof Error ? e : new Error('头像上传失败，请重试')) }
    finally { setUploading(false) }
  }
  async function choose() {
    try { await upload(await chooseCover()) }
    catch (e) { if (e instanceof Error && !e.message.includes('cancel')) setUploadError(e) }
  }
  function save(value: string) {
    if (disabled || localAvatar && !avatarId) return
    setNickname(value); setSaved(false)
    void action.run(() => saveProfile({ nickname: value, avatarId }), result => {
      setNickname(result.nickname === '微信用户' ? '' : result.nickname)
      setLocalAvatar(''); setSaved(true)
    })
  }
  return <Form className='surface profile-form' onSubmit={e => save(String(e.detail.value?.nickname ?? ''))}><View className='form'>
    <Text className='field-label'>头像</Text>
    <View className='profile-avatar-editor'>
      <Button className='profile-avatar-picker' ariaLabel='选择头像' openType={process.env.TARO_ENV === 'weapp' ? 'chooseAvatar' : undefined} disabled={disabled} onChooseAvatar={e => void upload(e.detail.avatarUrl)} onClick={process.env.TARO_ENV === 'weapp' ? undefined : () => void choose()}>
        <View>{localAvatar ? <Image className='profile-avatar-preview' src={localAvatar} mode='aspectFill' ariaLabel='待保存的头像'/> : <Avatar user={{ ...user, avatarId }} partnerId={partnerId} size={88}/>}</View>
        <Text className='primary-text'>{uploading ? '头像上传中…' : '选择头像'}</Text>
      </Button>
      {(avatarId || localAvatar) && <Button className='text-button' disabled={disabled} onClick={() => { setAvatarId(''); setLocalAvatar(''); setUploadError(null); setSaved(false) }}>使用默认头像</Button>}
    </View>
    <Text className='muted'>{process.env.TARO_ENV === 'weapp' ? '点击头像选择照片；填写昵称时可选用微信昵称。' : '选择一张照片，并填写你想使用的昵称。'}</Text>
    <ErrorState error={uploadError}/>
    {uploadError && localAvatar && <Button className='button secondary' disabled={disabled} onClick={() => void upload(localAvatar)}>重新上传头像</Button>}
    <Text className='field-label'>昵称</Text>
    <Input className='input' name='nickname' type={process.env.TARO_ENV === 'weapp' ? 'nickname' : 'text'} ariaLabel='昵称' placeholder='未填写时显示“微信用户”' value={nickname} maxlength={40} disabled={action.busy} onInput={e => { setNickname(e.detail.value); setSaved(false) }} onBlur={e => setNickname(e.detail.value)}/>
    <Text className='muted'>最多 40 个字符。保存后，你和伴侣看到的头像、昵称会同步更新。</Text>
    <ErrorState error={action.error}/>
    {saved && <View className='primary-text' role='status'>资料已保存</View>}
    <Button className='button' formType={process.env.TARO_ENV === 'weapp' ? 'submit' : undefined} onClick={process.env.TARO_ENV === 'weapp' ? undefined : () => save(nickname)} loading={action.busy} disabled={disabled || !!localAvatar && !avatarId}>保存资料</Button>
  </View></Form>
}
