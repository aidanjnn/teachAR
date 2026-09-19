import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        voiceLab: fileURLToPath(new URL('./voice-lab.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
});
