import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { accentColors, accents, nativeColors, parseAppearance, resolveScheme } from '../src/core/appearance'
import { artworkFiles, getArtwork } from '../src/ui/artwork'
import sharp from 'sharp'

function luminance(hex: string) {
  const values = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
it('defaults to system and iris, ignoring corrupt or outdated saved options', () => {
  expect(parseAppearance(undefined)).toEqual({ mode: 'system', accent: 'iris' })
  expect(parseAppearance({ mode: 'unknown', accent: 'deleted' })).toEqual({ mode: 'system', accent: 'iris' })
  expect(parseAppearance({ mode: 'dark', accent: 'teal' })).toEqual({ mode: 'dark', accent: 'teal' })
})
it('explicit light/dark overrides the device while system follows it', () => {
  expect(resolveScheme('system', 'dark')).toBe('dark')
  expect(resolveScheme('system', 'light')).toBe('light')
  expect(resolveScheme('light', 'dark')).toBe('light')
  expect(resolveScheme('dark', 'light')).toBe('dark')
})
describe.each(['light', 'dark'] as const)('%s theme contrast and assets', scheme => {
  it('keeps native secondary text legible', () => expect(contrast(nativeColors[scheme].muted, nativeColors[scheme].surface)).toBeGreaterThanOrEqual(4.5))
  it.each(accents)('$label has legible button and selected state, plus complete tab icons', accent => {
    const colors = accentColors[accent.value][scheme]
    expect(contrast(colors.primary, colors.onPrimary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.primary, colors.tint)).toBeGreaterThanOrEqual(4.5)
    for (const name of ['home', 'tasks', 'shop', 'me']) for (const suffix of ['', '-active']) {
      expect(existsSync(resolve(`src/assets/tab-icons/${name}-${accent.value}-${scheme}${suffix}.png`))).toBe(true)
    }
    const css = readFileSync(resolve('src/styles/app.scss'), 'utf8').toLowerCase()
    for (const color of Object.values(colors)) expect(css).toContain(color.toLowerCase())
  })
})
it('the native cold-start theme matches shared page and tab colors', () => {
  const config = JSON.parse(readFileSync(resolve('src/theme.json'), 'utf8'))
  for (const scheme of ['light', 'dark'] as const) {
    expect(config[scheme].page).toBe(nativeColors[scheme].page)
    expect(config[scheme].surface).toBe(nativeColors[scheme].surface)
    expect(config[scheme].primary).toBe(accentColors.iris[scheme].primary)
    for (const name of ['home', 'tasks', 'shop', 'me']) for (const suffix of ['Icon', 'Active']) expect(existsSync(resolve('src', config[scheme][name + suffix]))).toBe(true)
  }
})

it('packages transparent palette sprites at the original dimensions with an open avatar frame', async () => {
  expect(new Set(artworkFiles).size).toBe(21)
  for (const accent of ['teal', 'apricot'] as const) {
    const original = getArtwork('iris'), palette = getArtwork(accent)
    for (const name of ['avatarFrame', 'pointsJar', 'checkinPanel', 'milestoneRosette', 'emptyTasks', 'emptyStore'] as const) {
      const file = resolve('src' + palette[name])
      const image = await sharp(file).metadata(), reference = await sharp(resolve('src' + original[name])).metadata()
      expect([image.width, image.height]).toEqual([reference.width, reference.height])
      expect(image.hasAlpha).toBe(true)
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect(data[3]).toBe(0)
      if (name === 'avatarFrame') expect(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3]).toBe(0)
    }
  }
})
