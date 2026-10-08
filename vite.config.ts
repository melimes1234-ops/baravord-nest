import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => ({
  base: './',
  build: mode === 'demo' ? { outDir: 'dist-demo' } : undefined,
  plugins: [
    react(),
    ...(mode === 'demo' ? [viteSingleFile()] : [])
    ,
    mode === 'demo' ? null : VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'برآورد قیمت WPC',
        short_name: 'برآورد WPC',
        lang: 'fa',
        dir: 'rtl',
        display: 'standalone',
        background_color: '#f6f7f5',
        theme_color: '#1f6f5c',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
}))
