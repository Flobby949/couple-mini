import { defineConfig } from '@tarojs/cli'
import dotenv from 'dotenv'
import path from 'node:path'

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
  copy: { patterns: [{ from: path.resolve(__dirname, '../src/assets/tab-icons'), to: 'assets/tab-icons' }], options: {} },
  h5: {
    publicPath: '/',
    router: { mode: 'hash' },
    devServer: { host: '127.0.0.1', port: 10086 },
  },
})
