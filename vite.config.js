import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  ...(process.env.INCLUDE_BASE ? {base: './'} : {}),
})
