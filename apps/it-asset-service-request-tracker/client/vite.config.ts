import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// Dev: the Vite server runs on 5202 and forwards /api to the ASP.NET Core API on 5201,
// so the browser only ever talks to one origin.
// Build: the output goes straight into the API's wwwroot so `dotnet run` serves the whole app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5202,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5201',
    },
  },
  build: {
    outDir: '../src/ItAssetTracker.Api/wwwroot',
    emptyOutDir: true,
    // Hashed bundles go to /static so they never clash with app routes such as /assets/42.
    assetsDir: 'static',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
