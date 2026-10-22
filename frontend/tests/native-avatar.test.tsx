import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
const media = vi.hoisted(() => ({ path: 'wxfile://downloaded-avatar', error: undefined as string | undefined, retry: vi.fn(), invalidate: vi.fn() }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Button: 'button', Image: 'image' }))
vi.mock('@tarojs/taro', () => ({ default: { pxTransform: (n: number) => `${n}rpx` } }))
vi.mock('../src/core/media', () => ({ useMedia: () => media }))
vi.mock('../src/app/theme', () => ({ useTheme: () => ({ scheme: 'light', appearance: { accent: 'iris' } }) }))
vi.mock('../src/platform', () => ({ navigate: vi.fn() }))
import { Avatar, ConnectedPair, PersonRow } from '../src/ui/visual'
let tree: ReactTestRenderer | undefined
beforeEach(() => { media.path = 'wxfile://downloaded-avatar'; media.error = undefined; vi.clearAllMocks() })
afterEach(() => { act(() => tree?.unmount()); tree = undefined })
it('uses saved avatars in the shared portrait, paired users and person rows', () => {
  const user = { id: 'alice', nickname: 'Alice', avatarId: 'saved-file' }
  act(() => { tree = create(<><Avatar user={user} partnerId='bob'/><ConnectedPair me={user}/><PersonRow user={user} partnerId='bob'/></>) })
  const portraits = tree!.root.findAllByType('image').filter(node => node.props.mode === 'aspectFill')
  expect(portraits).toHaveLength(3)
  for (const node of portraits) expect(node.props.src).toBe('wxfile://downloaded-avatar')
  expect(tree!.root.findByProps({ className: 'connected-thread' }).props.src).toBe('/packages/account/assets/ui-icons/checkin-connection-iris-light.png')
})
it('keeps the default illustration when no avatar is set', () => {
  act(() => { tree = create(<Avatar user={{ id: 'alice', nickname: '微信用户' }} partnerId='bob'/>) })
  expect(tree!.root.findByProps({ className: 'portrait-art' }).props.src).toBe('/assets/avatar-woman.png')
})
it('offers a retry when a saved avatar cannot be read instead of treating it as unset', () => {
  media.path = ''; media.error = '读取失败'
  act(() => { tree = create(<Avatar user={{ id: 'alice', nickname: 'Alice', avatarId: 'file' }} partnerId='bob'/>) })
  const stopPropagation = vi.fn()
  act(() => { tree!.root.findByProps({ ariaLabel: '头像读取失败，点击重试' }).props.onClick({ stopPropagation }) })
  expect(media.retry).toHaveBeenCalledOnce(); expect(stopPropagation).toHaveBeenCalledOnce()
})
