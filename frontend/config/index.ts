import { defineConfig } from '@tarojs/cli'
import dotenv from 'dotenv'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { artworkFiles } from '../src/ui/artwork'

dotenv.config()
export default defineConfig<'vite'>({
  projectName: 'couple-mini',
  date: '2026-10-21',
  designWidth: 390,
  deviceRatio: { 390: 750 / 390 },
  sourceRoot: 'src',
  outputRoot: `dist/${process.env.TARO_ENV || 'weapp'}`,
  framework: 'react',
  compiler: 'vite',
  plugins: ['@tarojs/plugin-framework-react', '@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-h5'],
  defineConstants: {
    API_BASE: JSON.stringify(process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080/api/v1'),
    DEV_LOGIN: JSON.stringify(process.env.NODE_ENV !== 'production' && process.env.TARO_APP_DEV_LOGIN === 'true'),
  },
  mini: {},
  copy: {
    patterns: [
      // Detail illustrations belong to each consuming package; subpackages cannot share each other's files.
      ...artworkFiles.flatMap(asset => (asset.endsWith('/milestone-rosette.png') ? ['packages/account', 'packages/tasks'] : [''])
        .map(prefix => ({ from: path.resolve(__dirname, '../src' + asset), to: (prefix + asset).replace(/^\//, '') }))),
      { from: path.resolve(__dirname, '../src/assets/tab-icons'), to: 'assets/tab-icons' },
      { from: path.resolve(__dirname, '../src/assets/off-sale-stamp-round.png'), to: 'packages/commerce/assets/off-sale-stamp.png' },
      ...readdirSync(path.resolve(__dirname, '../src/assets/ui-icons')).map(file => ({
        from: path.resolve(__dirname, '../src/assets/ui-icons', file),
        to: `assets/ui-icons/${file}`,
      })),
    ],
    options: {},
  },
  h5: {
    publicPath: '/',
    postcss: { pxtransform: { config: { maxRootSize: 20.8 } } },
    router: { mode: 'hash' },
    devServer: { host: '127.0.0.1', port: 10086 },
  },
})
