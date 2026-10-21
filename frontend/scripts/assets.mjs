import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const output = `${root}frontend/src/assets`
await mkdir(output, { recursive: true })
for (const [file, width] of [
  ['decor/checkin-fabric-panel.png', 700], ['decor/avatar-stitch-frame.png', 224],
  ['decor/home-shelf.png', 240], ['illustrations/points-jar.png', 128],
  ['illustrations/milestone-rosette.png', 384], ['avatars/avatar-woman.png', 336], ['avatars/avatar-man.png', 336], ['illustrations/empty-tasks.png', 400], ['illustrations/empty-store.png', 440],
]) {
  await sharp(`${root}assets/ui/v1/${file}`).resize({ width }).png({ palette: true, quality: 85 }).toFile(`${output}/${file.split('/').at(-1)}`)
}
const icons = {
  home: '<path d="M5 14 16 4l11 10v14h-8v-9h-6v9H5Z"/>',
  tasks: '<rect x="7" y="6" width="19" height="23" rx="3"/><path d="M12 3h9v6h-9ZM12 18l4 4 6-8"/>',
  shop: '<path d="M6 11h21l2 18H4ZM11 12V8a5 5 0 0 1 10 0v4"/>',
  me: '<circle cx="16" cy="10" r="5"/><path d="M6 28v-3a10 10 0 0 1 20 0v3Z"/>',
}
await mkdir(`${output}/tab-icons`, { recursive: true })
const colors = { iris: ['#6752A3', '#C7B5F4'], teal: ['#236D63', '#8DD7C7'], apricot: ['#99501F', '#F4BB8B'] }
for (const [name, path] of Object.entries(icons)) for (const [accent, palette] of Object.entries(colors)) for (const scheme of ['light', 'dark']) for (const active of [false, true]) {
  const color = active ? palette[scheme === 'dark' ? 1 : 0] : scheme === 'dark' ? '#BBB2CA' : '#8889AA'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><g fill="${active ? color : 'none'}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</g>${active && name === 'home' ? `<path d="M13 29V19h6v10" fill="${scheme === 'dark' ? '#24212D' : '#FFFFFF'}"/>` : active && name === 'tasks' ? `<path d="m12 18 4 4 6-8" fill="none" stroke="${scheme === 'dark' ? '#24212D' : '#FFFFFF'}" stroke-width="2"/>` : ''}</svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${output}/tab-icons/${name}-${accent}-${scheme}${active ? '-active' : ''}.png`)
}

// PNG exports keep the same small interface glyphs available in H5 and native mini-program images.
const iconPaths = JSON.parse(await readFile(new URL('../src/ui/icon-paths.json', import.meta.url), 'utf8'))
await mkdir(`${output}/ui-icons`, { recursive: true })
for (const [name, body] of Object.entries(iconPaths)) for (const scheme of ['light','dark']) {
  const tones = { ink: scheme === 'dark' ? '#F2EDF8' : '#19103F', muted: scheme === 'dark' ? '#BBB2CA' : '#71677E', ...Object.fromEntries(Object.entries(colors).map(([key,value]) => [key,value[scheme === 'dark' ? 1 : 0]])) }
  for (const [tone,color] of Object.entries(tones)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><g fill="none" stroke="${color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
    await sharp(Buffer.from(svg)).png({palette:true}).toFile(`${output}/ui-icons/${name}-${tone}-${scheme}.png`)
  }
}

// The same SVG geometry is exported at 3x for native mini-program Image compatibility.
const connection = await readFile(new URL('../src/ui/checkin-connection.svg', import.meta.url), 'utf8')
const tint = (hex, amount) => '#' + hex.slice(1).match(/../g).map(part => Math.round(parseInt(part,16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('')
for (const [accent,palette] of Object.entries(colors)) for (const [index,scheme] of ['light','dark'].entries()) {
  const color=palette[index]
  const svg=connection.replaceAll('#6752a3',color).replaceAll('#b7a6db',tint(color,.5)).replaceAll('#e4dcf3',tint(color,.78))
  await sharp(Buffer.from(svg)).resize(468,240).png().toFile(`${output}/ui-icons/checkin-connection-${accent}-${scheme}.png`)
}

await import('./theme-assets.mjs')
