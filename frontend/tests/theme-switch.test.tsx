import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { Scheme } from '../src/core/appearance'

const device = vi.hoisted(() => ({
  stored: undefined as unknown, scheme: 'light' as Scheme,
  listener: undefined as undefined | ((event: { theme: Scheme }) => void),
  write: vi.fn(),
}))
vi.mock('../src/platform', () => ({ storage: {
  read: () => device.stored,
  write: (key: string, value: unknown) => { device.write(key, value); device.stored = value },
} }))
vi.mock('@tarojs/taro', () => ({
  useDidShow: () => {},
  default: {
    getAppBaseInfo: () => ({ theme: device.scheme }),
    onThemeChange: (fn: typeof device.listener) => { device.listener = fn },
    offThemeChange: () => { device.listener = undefined },
  },
}))

import { ThemeProvider, useTheme } from '../src/app/theme'
import { useArtwork } from '../src/ui/use-artwork'
import { getArtwork } from '../src/ui/artwork'
let current: ReturnType<typeof useTheme>
let tree: ReactTestRenderer | undefined
function Probe() {
  current = useTheme()
  return <>{Object.entries(useArtwork()).map(([name, src]) => <img key={name} alt={name} src={src}/>)}</>
}
function mount() { act(() => { tree = create(<ThemeProvider><Probe/></ThemeProvider>) }) }
beforeEach(() => {
  vi.stubEnv('TARO_ENV', 'weapp'); device.stored = undefined; device.scheme = 'light'; device.write.mockClear()
})
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllEnvs() })

it('switches illustrations immediately for all six appearances and restores the saved choice after restart', () => {
  mount()
  for (const mode of ['light', 'dark'] as const) for (const accent of ['iris', 'teal', 'apricot'] as const) {
    act(() => current.setAppearance({ mode, accent }))
    expect(current.scheme).toBe(mode)
    const actual = Object.fromEntries(tree!.root.findAllByType('img').map(image => [image.props.alt, image.props.src]))
    expect(actual).toEqual(getArtwork(accent))
    expect(actual.avatarWoman).toBe('/assets/avatar-woman.png')
    expect(actual.avatarMan).toBe('/assets/avatar-man.png')
    if (accent !== 'iris') for (const name of ['avatarFrame', 'pointsJar', 'checkinPanel', 'milestoneRosette', 'emptyTasks', 'emptyStore']) expect(actual[name]).toContain(`/artwork/${accent}/`)
    expect(device.write).toHaveBeenLastCalledWith('appearance', { mode, accent })
  }
  act(() => tree!.unmount()); mount()
  expect(current.appearance).toEqual({ mode: 'dark', accent: 'apricot' })
  expect(current.scheme).toBe('dark')
  expect(tree!.root.findByProps({ alt: 'pointsJar' }).props.src).toBe('/assets/artwork/apricot/points-jar.png')
})

it('follows device theme changes only in system mode and releases its listener', () => {
  device.stored = { mode: 'system', accent: 'teal' }; mount()
  expect(current.scheme).toBe('light')
  act(() => device.listener!({ theme: 'dark' }))
  expect(current.scheme).toBe('dark')
  act(() => current.setAppearance({ mode: 'light', accent: 'teal' }))
  act(() => device.listener!({ theme: 'dark' }))
  expect(current.scheme).toBe('light')
  act(() => tree!.unmount()); tree = undefined
  expect(device.listener).toBeUndefined()
})
