export type ColorMode = 'system' | 'light' | 'dark'
export type Accent = 'iris' | 'teal' | 'apricot'
export type Scheme = 'light' | 'dark'
export interface Appearance { mode: ColorMode; accent: Accent }
export const defaultAppearance: Appearance = { mode: 'system', accent: 'iris' }
export const accents: { value: Accent; label: string; sample: string }[] = [
  { value: 'iris', label: '鸢尾紫', sample: '#6752A3' },
  { value: 'teal', label: '青绿', sample: '#236D63' },
  { value: 'apricot', label: '杏橙', sample: '#99501F' },
]
export const accentColors = {
  iris: { light: { primary: '#6752A3', tint: '#EEEAF6', onPrimary: '#FFFFFF' }, dark: { primary: '#C7B5F4', tint: '#322B45', onPrimary: '#241B37' } },
  teal: { light: { primary: '#236D63', tint: '#E4F2EE', onPrimary: '#FFFFFF' }, dark: { primary: '#8DD7C7', tint: '#1C3934', onPrimary: '#102D27' } },
  apricot: { light: { primary: '#99501F', tint: '#FFF0E3', onPrimary: '#FFFFFF' }, dark: { primary: '#F4BB8B', tint: '#453023', onPrimary: '#382313' } },
}
export const badgeColors = {
  iris: { light: { ink: '#925C00', line: '#BD8500' }, dark: { ink: '#FFD45B', line: '#FFD45B' } },
  teal: { light: { ink: '#B13F26', line: '#DE6747' }, dark: { ink: '#FFB19B', line: '#FFB19B' } },
  apricot: { light: { ink: '#2455BD', line: '#3D78F0' }, dark: { ink: '#94BFFF', line: '#94BFFF' } },
}
export const nativeColors = {
  light: { page: '#F6F7FC', surface: '#FFFFFF', muted: '#71677E', front: '#000000', border: 'white' },
  dark: { page: '#17151E', surface: '#24212D', muted: '#BBB2CA', front: '#ffffff', border: 'black' },
}
export function resolveScheme(mode: ColorMode, system: Scheme): Scheme { return mode === 'system' ? system : mode }
export function parseAppearance(value: unknown): Appearance {
  const stored = value as Partial<Appearance> | null
  return {
    mode: stored && ['system', 'light', 'dark'].includes(stored.mode || '') ? stored.mode! : 'system',
    accent: stored && accents.some(a => a.value === stored.accent) ? stored.accent! : 'iris',
  }
}
