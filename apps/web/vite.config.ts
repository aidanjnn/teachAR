import { defineConfig } from 'vite';
const apiPort = Number(process.env.PORT || '3001');
const webPort = Number(process.env.DEV_WEB_PORT || '5173');
if ([apiPort, webPort].some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('Invalid development port');
export default defineConfig({
  server: {
    host: '127.0.0.1', port: webPort, strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
      '/ws': { target: `ws://127.0.0.1:${apiPort}`, ws: true },
    },
  },
});
