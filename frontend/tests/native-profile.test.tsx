import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const fixture = vi.hoisted(() => ({
  context: { stage: 'binding', me: { id: 'alice', nickname: '微信用户', avatarId: '' }, partner: null },
  upload: vi.fn(), save: vi.fn(),
  visible: true,
}))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Input: 'input', Form: 'form', Button: 'button', Image: 'image' }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: fixture.context, error: null, refetch: vi.fn() }) }))
vi.mock('../src/app/hooks', () => ({ useVisible: () => fixture.visible }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/core/api', () => ({ session: () => ({ user: { id: 'alice' } }) }))
vi.mock('../src/core/query', () => ({ keys: { context: ['context'] }, refresh: () => Promise.resolve() }))
vi.mock('../src/core/media', () => ({ uploadMedia: fixture.upload }))
vi.mock('../src/features/identity/api', () => ({ getContext: vi.fn(), saveProfile: fixture.save }))
vi.mock('../src/ui/visual', () => ({ Avatar: () => null }))
vi.mock('../src/platform', () => ({ back: vi.fn(), redirect: vi.fn() }))
vi.mock('../src/platform/media', () => ({ chooseCover: vi.fn() }))
import Profile from '../src/packages/account/profile'
let tree: ReactTestRenderer | undefined
beforeEach(() => {
  vi.stubEnv('TARO_ENV', 'weapp'); vi.clearAllMocks()
  fixture.visible = true
  fixture.context = { stage: 'binding', me: { id: 'alice', nickname: '微信用户', avatarId: '' }, partner: null }
  fixture.upload.mockResolvedValue('durable-file')
  fixture.save.mockResolvedValue({ id: 'alice', nickname: '微信昵称', avatarId: 'durable-file' })
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllEnvs() })
function mount() { act(() => { tree = create(<Profile/>) }) }
const button = (label: string) => tree!.root.findAllByType('button').find(node => node.children.includes(label))!
const submit = (nickname: string) => tree!.root.findByType('form').props.onSubmit({ detail: { value: { nickname } } })
it('allows an unbound user to choose a WeChat avatar and submit the actual native nickname value', async () => {
  mount()
  expect(tree!.root.findByType('input').props.type).toBe('nickname')
  const picker = tree!.root.findByProps({ openType: 'chooseAvatar' })
  await act(async () => { await picker.props.onChooseAvatar({ detail: { avatarUrl: 'wxfile://chosen' } }) })
  expect(fixture.upload).toHaveBeenCalledWith('wxfile://chosen', 'avatar')
  // Native nickname selection need not emit onInput; Form's submitted value is authoritative.
  await act(async () => { submit('微信昵称') })
  expect(fixture.save).toHaveBeenCalledWith({ nickname: '微信昵称', avatarId: 'durable-file' })
  expect(tree!.root.findByProps({ role: 'status' }).children).toContain('资料已保存')
})
it('retains an unsaved nickname across refetches and blocks saving after an upload failure until retry succeeds', async () => {
  fixture.upload.mockRejectedValueOnce(new Error('网络中断'))
  mount()
  act(() => { tree!.root.findByType('input').props.onInput({ detail: { value: '未保存的昵称' } }) })
  fixture.context.me.nickname = '服务端旧昵称'
  act(() => { tree!.update(<Profile/>) })
  expect(tree!.root.findByType('input').props.value).toBe('未保存的昵称')
  await act(async () => { await tree!.root.findByProps({ openType: 'chooseAvatar' }).props.onChooseAvatar({ detail: { avatarUrl: 'wxfile://chosen' } }) })
  expect(button('保存资料').props.disabled).toBe(true)
  expect(tree!.root.findByProps({ ariaLabel: '待保存的头像' }).props.src).toBe('wxfile://chosen')
  await act(async () => { submit('未保存的昵称') })
  expect(fixture.save).not.toHaveBeenCalled()
  await act(async () => { await button('重新上传头像').props.onClick() })
  await act(async () => { submit('未保存的昵称') })
  expect(fixture.save).toHaveBeenCalledWith({ nickname: '未保存的昵称', avatarId: 'durable-file' })
})
it('can restore the default avatar and leave the nickname unset', async () => {
  fixture.context.me.avatarId = 'old-file'
  mount()
  act(() => { button('使用默认头像').props.onClick() })
  await act(async () => { submit('') })
  expect(fixture.save).toHaveBeenCalledWith({ nickname: '', avatarId: '' })
})
it('preserves the profile form and unsaved nickname while a native picker hides the page', () => {
  mount()
  act(() => tree!.root.findByType('input').props.onInput({ detail: { value: '未保存的昵称' } }))
  fixture.visible = false
  act(() => tree!.update(<Profile/>))
  expect(tree!.root.findAllByType('form')).toHaveLength(1)
  fixture.visible = true
  act(() => tree!.update(<Profile/>))
  expect(tree!.root.findByType('input').props.value).toBe('未保存的昵称')
})
it('supports mouse clicks in the H5 preview without requiring a native touch submit', async () => {
  vi.stubEnv('TARO_ENV', 'h5')
  mount()
  act(() => { tree!.root.findByType('input').props.onInput({ detail: { value: '浏览器昵称' } }) })
  expect(button('保存资料').props.formType).toBeUndefined()
  await act(async () => { button('保存资料').props.onClick() })
  expect(fixture.save).toHaveBeenCalledWith({ nickname: '浏览器昵称', avatarId: '' })
})
