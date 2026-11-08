import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: [
      {
        // só o import "puro" 'leaflet-draw' (não afeta 'leaflet-draw/dist/...')
        find: /^leaflet-draw$/,
        replacement: fileURLToPath(
          new URL('./src/shims/leaflet-draw.ts', import.meta.url),
        ),
      },
    ],
  },
})
