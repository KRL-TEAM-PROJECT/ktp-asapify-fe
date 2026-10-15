import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// MapLibre 6 loads a module worker (maplibre-gl-worker.mjs → maplibre-gl-shared.mjs) from separate files.
// Vite transforms requested JS files, which silences the worker; this plugin serves them raw
// under /maplibre/ in dev and copies them to dist/maplibre/ on build (see setWorkerUrl in src/map/regionMap.ts).
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

// A build must say which data it shows: without VITE_API_MODE the app falls back to fictional mock data, and a
// deploy that forgot the variable would publish it. `npm run dev` keeps the mock default.
function requireApiMode(): Plugin {
  return {
    name: 'require-api-mode',
    apply: 'build',
    configResolved(config) {
      const mode = config.env.VITE_API_MODE;
      if (mode !== 'live' && mode !== 'mock') {
        throw new Error(`VITE_API_MODE must be "live" or "mock" for a build, got ${JSON.stringify(mode)}. "mock" ships fictional data.`);
      }
    },
  };
}

// Live mode without VITE_API_BASE: /api/** is proxied to a local asapify-api in dev.
export default defineConfig({
  plugins: [react(), maplibreWorker(), requireApiMode()],
  build: {
    rollupOptions: {
      input: { app: 'index.html', 'notification-sw': 'src/notification-sw.ts' },
      output: { entryFileNames: chunk => chunk.name === 'notification-sw' ? 'notification-sw.js' : 'assets/[name]-[hash].js' },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api/': 'http://localhost:8080' }, // trailing slash: /api-contract is an app route
  },
});
