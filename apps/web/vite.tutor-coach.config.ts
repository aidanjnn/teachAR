import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Builds the coach runtime as one ES module for the Quest Browser tutor, which has no bundler of its own.
 * The output lands next to the vendored Three.js and is gitignored the same way; prepare-vendor.mjs runs this.
 */
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/tutor-coach.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'trail-coach.js',
    },
    outDir: fileURLToPath(new URL('../../apps/webxr/public/vendor', import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    target: 'es2022',
  },
});
