import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// MapLibre 6 memuat worker modul (maplibre-gl-worker.mjs → maplibre-gl-shared.mjs) dari file terpisah.
// Vite mentransformasi file JS yang diminta sehingga worker diam; plugin ini menyajikannya mentah
// di /maplibre/ saat dev dan menyalinnya ke dist/maplibre/ saat build (lihat setWorkerUrl di src/map/map.ts).
function maplibreWorker(): Plugin {
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
  const read = (f: string) => readFileSync(`node_modules/maplibre-gl/dist/${f}`);
  return {
    name: 'maplibre-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = files.find((x) => req.url?.split('?')[0] === `/maplibre/${x}`);
        if (!f) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(read(f));
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: 'asset', fileName: `maplibre/${f}`, source: read(f) });
    },
  };
}

// Mode live tanpa VITE_API_BASE: /api/** diteruskan ke asapify-api lokal saat dev.
export default defineConfig({
  plugins: [react(), maplibreWorker()],
  build: {
    rollupOptions: {
      input: { app: 'index.html', 'notification-sw': 'src/notification-sw.ts' },
      output: { entryFileNames: chunk => chunk.name === 'notification-sw' ? 'notification-sw.js' : 'assets/[name]-[hash].js' },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
