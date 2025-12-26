import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, mkdirSync, renameSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'copy-qrcode-and-rename',
      writeBundle() {
        // Copy qrcode.js to dist/scripts
        mkdirSync('dist/scripts', { recursive: true })
        copyFileSync('scripts/qrcode.js', 'dist/scripts/qrcode.js')

        // Rename index-vue.html to index.html
        if (existsSync('dist/index-vue.html')) {
          renameSync('dist/index-vue.html', 'dist/index.html')
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index-vue.html'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  publicDir: 'public',
  base: './'
})
