import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

/**
 * The build identity, injected at build time. Updates are silent, so this is
 * the only way to tell what is running.
 *
 * Vercel does not ship a `.git` directory to the build container, so the SHA
 * comes from its environment when present and from git otherwise.
 */
function buildSha(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'generateSW',
      // A misnomer: it means the worker never calls skipWaiting() on its own.
      // Nothing in this app prompts — updates are silent. See src/shell/update-control.ts.
      registerType: 'prompt',
      // Registration is hand-rolled so the update rules are explicit and testable.
      injectRegister: null,
      filename: 'sw.js',
      // The glob below already precaches every icon and the webmanifest; the
      // plugin's own pass would list them a second time.
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'vape-off',
        short_name: 'vape-off',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0b0d',
        theme_color: '#0b0b0d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Hard offline: precache the whole app. With no server cookie and no
        // telemetry there is no runtime network dependency, so there is
        // deliberately no runtimeCaching here at all.
        // No `webmanifest` here: the plugin precaches its own manifest, and
        // listing it twice is a second fetch for the same bytes.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        // One self-contained sw.js, so the worker's own runtime is not a second
        // file with its own cache headers to get wrong.
        inlineWorkboxRuntime: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
