import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: { port: 5173, host: '127.0.0.1' }
})