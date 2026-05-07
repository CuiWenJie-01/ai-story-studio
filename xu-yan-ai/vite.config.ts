import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000, // 将警告阈值提高到 1000KB
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 10000,
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/]react/,
              priority: 20,
            },
            {
              name: 'lucide',
              test: /node_modules[\\/]lucide-react/,
              priority: 15,
            },
            {
              name: 'tauri',
              test: /node_modules[\\/]@tauri-apps/,
              priority: 15,
            },
            {
              name: 'xlsx',
              test: /node_modules[\\/]xlsx/,
              priority: 12,
            },
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 10,
            },
            {
              name: 'common',
              minShareCount: 2,
              minSize: 5000,
              priority: 5,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/yunwu': {
        target: 'https://yunwu.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yunwu/, ''),
      },
    },
  },
})
