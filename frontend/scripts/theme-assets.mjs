import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const names = ['checkin-fabric-panel', 'avatar-stitch-frame', 'points-jar', 'milestone-rosette', 'empty-tasks', 'empty-store']

// Match the existing sprites' visible bounds so switching palettes preserves the layout.
async function bounds(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width, top = info.height, right = 0, bottom = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] <= 12) continue
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

for (const accent of ['teal', 'apricot']) {
  const output = `${root}frontend/src/assets/artwork/${accent}`
  await mkdir(output, { recursive: true })
  const source = `${root}assets/ui/themes/${accent}-atlas.png`
  const atlas = await sharp(source).metadata()
  if (atlas.width !== 1536 || atlas.height !== 1024 || !atlas.hasAlpha) throw new Error(`Invalid theme atlas: ${accent}`)
  for (const [index, name] of names.entries()) {
    const original = `${root}frontend/src/assets/${name}.png`
    const size = await sharp(original).metadata(), target = await bounds(original)
    const cell = await sharp(source).extract({ left: index % 3 * 512, top: Math.floor(index / 3) * 512, width: 512, height: 512 }).png().toBuffer()
    const sprite = await sharp(cell).extract(await bounds(cell)).resize(target.width, target.height, { fit: 'contain', background: '#00000000' }).png().toBuffer()
    await sharp({ create: { width: size.width, height: size.height, channels: 4, background: '#00000000' } })
      .composite([{ input: sprite, left: target.left, top: target.top }]).png({ palette: true, quality: 85 }).toFile(`${output}/${name}.png`)
  }
}
