// Vite production build for the web (GitHub Pages, any static host) and for the
// Android app, which packages the same dist/ folder with Capacitor.
// The app is plain ES modules with no framework; Vite only serves them in
// development and bundles and minifies them for release.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative URLs, so dist/ works from any sub-folder and inside the app
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    port: 8770,
    // tools/npm.sh runs Windows npm on the WSL share, where native watching fails.
    watch: process.env.MERIDIAN_POLL ? { usePolling: true, interval: 300 } : undefined,
  },
});
