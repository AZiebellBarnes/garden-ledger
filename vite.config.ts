import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// Relative base, so the same build works at any GitHub Pages path.
export default defineConfig({ base: './', plugins: [react(), tailwind()], build: { chunkSizeWarningLimit: 1500 } })
