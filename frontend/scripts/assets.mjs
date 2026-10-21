import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const output = `${root}frontend/src/assets`
await mkdir(output, { recursive: true })
for (const [file, width] of [
  ['decor/checkin-fabric-panel.png', 700], ['decor/avatar-stitch-frame.png', 224],
  ['decor/home-shelf.png', 240], ['illustrations/points-jar.png', 128],
  ['illustrations/empty-tasks.png', 400], ['illustrations/empty-store.png', 440],
]) {
  await sharp(`${root}assets/ui/v1/${file}`).resize({ width }).png({ palette: true, quality: 85 }).toFile(`${output}/${file.split('/').at(-1)}`)
}
const icons = {
  home: '<path d="M5 14 16 4l11 10v14h-8v-9h-6v9H5Z"/>',
  tasks: '<rect x="7" y="6" width="19" height="23" rx="3"/><path d="M12 3h9v6h-9ZM12 18l4 4 6-8"/>',
  shop: '<path d="M6 11h21l2 18H4ZM11 12V8a5 5 0 0 1 10 0v4"/>',
  me: '<circle cx="16" cy="16" r="13"/><path d="M10 20q6 7 12 0M11 12v1m10-1v1"/>',
}
await mkdir(`${output}/tab-icons`, { recursive: true })
const colors = { iris: ['#6752A3', '#C7B5F4'], teal: ['#236D63', '#8DD7C7'], apricot: ['#99501F', '#F4BB8B'] }
for (const [name, path] of Object.entries(icons)) for (const [accent, palette] of Object.entries(colors)) for (const scheme of ['light', 'dark']) for (const active of [false, true]) {
  const color = active ? palette[scheme === 'dark' ? 1 : 0] : scheme === 'dark' ? '#BBB2CA' : '#71677E'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><g fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${output}/tab-icons/${name}-${accent}-${scheme}${active ? '-active' : ''}.png`)
}
