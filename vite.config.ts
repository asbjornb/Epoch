/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

const buildTimestamp = Date.now().toString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'generate-version-json',
      writeBundle() {
        writeFileSync('dist/version.json', JSON.stringify({ v: buildTimestamp }))
      },
    },
  ],
  base: '/Epoch/',
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  test: {
    environment: 'node',
  },
})
