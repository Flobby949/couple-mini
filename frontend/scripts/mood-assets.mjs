import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sourceRoot = 'assets/ui/moods/v1'
const outputRoot = `${root}backend/assets/moods`
const ids = ['happy', 'calm', 'loving', 'missing', 'tired', 'sad', 'irritated', 'energetic']
const schemes = ['light', 'dark']
const width = 336
const png = { compressionLevel: 9, adaptiveFiltering: true }
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const exports = []

// Resize the complete square canvas; keep the source PNGs and their palettes untouched.
for (const id of ids) for (const scheme of schemes) {
  const sourcePath = `${sourceRoot}/${scheme}/${id}.png`
  const source = await readFile(`${root}${sourcePath}`)
  const metadata = await sharp(source).metadata()
  if (metadata.format !== 'png' || metadata.width !== metadata.height || !metadata.hasAlpha) {
    throw new Error(`Expected a square transparent PNG: ${sourcePath}`)
  }
  const bytes = await sharp(source).resize({ width }).png(png).toBuffer()
  exports.push({ id, scheme, bytes, sha256: digest(bytes), source: {
    path: sourcePath, sha256: digest(source), width: metadata.width, height: metadata.height,
  } })
}

// Fixed mood order, then light/dark; LF-separated lowercase SHA-256 hex, no trailing LF.
const revision = digest(exports.map(asset => asset.sha256).join('\n')).slice(0, 16)
for (const scheme of schemes) await mkdir(`${outputRoot}/${revision}/${scheme}`, { recursive: true })

const files = []
const clientFiles = Object.fromEntries(ids.map(id => [id, {}]))
for (const asset of exports) {
  const relativePath = `${asset.scheme}/${asset.id}.png`
  const file = `${outputRoot}/${revision}/${relativePath}`
  try {
    await writeFile(file, asset.bytes, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  // Existing revisions are immutable. Re-runs may reuse identical files, never replace them.
  const actualBytes = await readFile(file)
  const sha256 = digest(actualBytes)
  if (sha256 !== asset.sha256) throw new Error(`Refusing to overwrite immutable mood asset: ${file}`)
  const metadata = await sharp(actualBytes).metadata()
  if (metadata.width !== width || metadata.height !== width || !metadata.hasAlpha) {
    throw new Error(`Invalid exported mood asset: ${file}`)
  }
  files.push({ id: asset.id, scheme: asset.scheme, path: `${revision}/${relativePath}`,
    url: `/assets/moods/${revision}/${relativePath}`, sha256, bytes: actualBytes.length,
    width: metadata.width, height: metadata.height, source: asset.source })
  clientFiles[asset.id][asset.scheme] = { path: relativePath, sha256, bytes: actualBytes.length }
}

const totalBytes = files.reduce((total, asset) => total + asset.bytes, 0)
const manifest = {
  version: 1, revision, width, height: width, totalBytes,
  basePath: `/assets/moods/${revision}/`,
  revisionAlgorithm: 'First 16 hex characters of SHA-256 over the files array SHA-256 hex strings joined with LF, without a trailing LF.',
  export: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, resize: { width }, png },
  files,
}
await writeFile(`${outputRoot}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
const clientManifest = JSON.stringify({ revision, width, height: width, files: clientFiles }) + '\n'
await mkdir(`${root}frontend/src/features/checkin`, { recursive: true })
await writeFile(`${root}frontend/src/features/checkin/mood-asset-manifest.json`, clientManifest)

const largestBytes = Math.max(...files.map(asset => asset.bytes))
console.log(JSON.stringify({ revision, files: files.length, width, height: width, totalBytes,
  largestBytes, clientManifestBytes: Buffer.byteLength(clientManifest) }, null, 2))
if (totalBytes >= 1024 * 1024 || largestBytes >= 200 * 1024) {
  console.warn('Mood assets exceed the delivery size target; inspect quality before changing export settings.')
}
