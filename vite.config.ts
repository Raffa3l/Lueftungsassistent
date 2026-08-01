// defineConfig aus vitest/config, damit der `test`-Block typisiert ist.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative Basis-URL, damit die App auf beliebigem statischem Hosting
  // (GitHub Pages inkl. Unterverzeichnis, Netlify, Vercel) ohne Anpassung läuft.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
