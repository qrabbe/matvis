import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The Coop User-Agent the endpoints of the Coop Server expect.
 * Keep in sync with COOP_USER_AGENT in @matvis/connector.
 */
const COOP_USER_AGENT =
  'Coop/7.17; (11604; Production; Android 16; Android Build 36; Google; sdk_gphone64_x86_64)';

/**
 * Dev-only reverse proxy for `/coop-sso` and `/coop-api`
 */
function coopProxy(target: string) {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/coop-(sso|api)/, ''),
    configure: (proxy: {
      on: (
        event: 'proxyReq',
        cb: (proxyReq: { setHeader: (k: string, v: string) => void }) => void,
      ) => void;
    }) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('User-Agent', COOP_USER_AGENT);
        proxyReq.setHeader('Accept-Encoding', 'gzip');
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/coop-sso': coopProxy('https://sso.betala.coop.se'),
      '/coop-api': coopProxy('https://api.betala.coop.se'),
    },
  },
});
