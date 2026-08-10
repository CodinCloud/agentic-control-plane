import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'node:path'

const API_ORIGIN = 'http://localhost:4317'

export default defineConfig({
  // Le plugin de routing doit précéder celui de React : il génère `routeTree.gen.ts`
  // à partir de `src/routes/`, que React compile ensuite.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: API_ORIGIN, changeOrigin: true },
      '/stream': { target: API_ORIGIN, ws: true, changeOrigin: true },
    },
  },
  // Le SPA est servi en statique par l'API : un seul process, un seul port.
  build: {
    outDir: '../ControlPlane.Api/wwwroot',
    emptyOutDir: true,
  },
})
