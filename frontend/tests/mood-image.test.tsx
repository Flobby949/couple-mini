import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { MoodAsset } from '../src/contracts/checkin'

const state = vi.hoisted(() => ({ scheme: 'light', load: vi.fn(), cached: vi.fn(), forget: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: { pxTransform: (value: number) => `${value}px` } }))
vi.mock('@tarojs/components', () => ({ View: 'view', Text: 'text', Image: 'image' }))
vi.mock('../src/app/theme', () => ({ useTheme: () => ({ scheme: state.scheme }) }))
vi.mock('../src/platform/mood-cache', () => ({ loadMood: state.load, cachedMood: state.cached, forgetMood: state.forget }))
import { MoodImage } from '../src/features/checkin/mood-image'
let tree: ReactTestRenderer | undefined
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('API_BASE', 'https://example.com/couple-mini/api/v1'); state.scheme = 'light'; state.cached.mockReturnValue(undefined); state.load.mockImplementation(async (asset: MoodAsset) => asset.url) })
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllGlobals() })
it('switches to the dark asset without changing the chosen mood or its size', async () => {
  await act(async () => { tree = create(<MoodImage mood='happy' size={96}/>) })
  expect(tree!.root.findByType('image').props.src).toContain('/light/happy.png')
  state.scheme = 'dark'
  await act(async () => tree!.update(<MoodImage mood='happy' size={96}/>))
  expect(tree!.root.findByType('image').props.src).toContain('/dark/happy.png')
  expect(tree!.root.findByType('view').props.style).toEqual({ width: '96px', height: '96px' })
})
it('ignores a late light response after dark has loaded', async () => {
  let light!: (path: string) => void
  state.load.mockImplementationOnce(() => new Promise(resolve => { light = resolve }))
  await act(async () => { tree = create(<MoodImage mood='happy' size={48}/>) })
  state.scheme = 'dark'
  await act(async () => tree!.update(<MoodImage mood='happy' size={48}/>))
  await act(async () => light('old-light'))
  expect(tree!.root.findByType('image').props.src).toContain('/dark/happy.png')
})
it('never shows the previous emotion while the next day’s different image is loading', async () => {
  await act(async () => { tree = create(<MoodImage mood='happy' size={34}/>) })
  let complete!: (path: string) => void
  state.load.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  await act(async () => tree!.update(<MoodImage mood='sad' size={34}/>))
  expect(tree!.root.findAllByType('image')).toHaveLength(0)
  expect(tree!.root.findByType('text').children.join('')).toBe('低落')
  await act(async () => complete('sad-image'))
  expect(tree!.root.findByType('image').props.src).toBe('sad-image')
})
it('keeps an honest text label after decode failure and can retry the same mood', async () => {
  await act(async () => { tree = create(<MoodImage mood='happy' size={48}/>) })
  act(() => tree!.root.findByType('image').props.onError())
  expect(state.forget).toHaveBeenCalledWith(expect.objectContaining({ id: 'happy', scheme: 'light' }))
  expect(tree!.root.findByType('text').children.join('')).toBe('开心')
  await act(async () => tree!.root.findByType('view').props.onClick())
  expect(tree!.root.findByType('image').props.src).toContain('/light/happy.png')
})
