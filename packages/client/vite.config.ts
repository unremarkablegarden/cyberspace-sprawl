import { defineConfig } from 'vite'

// In development Vite serves the client and forwards rooms and API calls to
// `wrangler dev` on :8787. In production the Worker serves both.
export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/rooms': { target: 'http://127.0.0.1:8787', ws: true },
      '/api': { target: 'http://127.0.0.1:8787' },
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
})
