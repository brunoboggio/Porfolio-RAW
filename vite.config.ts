import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Yahoo Finance v8 API (quotes, charts)
      '/api/yahoo/v8': {
        target: 'https://query1.finance.yahoo.com/v8',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo\/v8/, ''),
      },
      // Yahoo Finance v1 API (search/autoc)
      '/api/yahoo/v1': {
        target: 'https://query1.finance.yahoo.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo\/v1/, ''),
      },
    },
  },
})
