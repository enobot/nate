import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The ASP.NET Core API listens on 5301. In development, Vite serves the client on 5302 and
// forwards API and SignalR traffic to the API so the browser only ever talks to one origin.
const api = 'http://localhost:5301';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5302,
    strictPort: true,
    proxy: {
      '/api': api,
      '/hubs': { target: api, ws: true },
      '/openapi': api,
    },
  },
  build: {
    // `dotnet run` serves this folder, so one process runs the whole demo.
    outDir: '../src/MovieTheater.Api/wwwroot',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      reporter: ['text-summary', 'html'],
    },
  },
});
