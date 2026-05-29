import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      '/workflows':   'http://localhost:8081',
      '/connections': 'http://localhost:8081',
      '/config':      'http://localhost:8081',
      '/camel':       'http://localhost:8081',
    }
  }
})

