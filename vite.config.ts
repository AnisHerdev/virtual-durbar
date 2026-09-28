/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { handleTokenRequest } from './server/token.ts';

/** Serves /api/token during `vite dev` / `vite preview`, mirroring the Pages Function. */
function devTokenEndpoint(env: Record<string, string>): Plugin {
  const middleware = async (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    next: () => void,
  ) => {
    if (!req.url?.startsWith('/api/token')) return next();
    const response = await handleTokenRequest(
      new Request(new URL(req.url, 'http://localhost'), { method: req.method }),
      env,
    );
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  };
  return {
    name: 'durbar-dev-token',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig(({ mode }) => {
  // '' prefix loads the server-only LIVEKIT_* values too; they never reach the bundle.
  const env = loadEnv(mode, process.cwd(), '');
  // `npm run dev:https`: self-signed HTTPS on the LAN, because browsers only
  // allow camera access on https:// or localhost.
  const https = mode === 'https';
  return {
    plugins: [react(), tailwindcss(), devTokenEndpoint(env), ...(https ? [basicSsl()] : [])],
    server: https ? { host: true } : undefined,
    preview: https ? { host: true } : undefined,
    build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 1200 },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
