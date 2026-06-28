import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Federated Workspace',
        short_name: 'FedWork',
        description: 'A private, end-to-end encrypted collaborative workspace',
        theme_color: '#6366f1',
        background_color: '#0f0f13',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // libp2p + automerge combined are large; allow up to 5 MiB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Force CJS build of libsodium — the ESM build has a broken relative import
      'libsodium-wrappers': new URL(
        '../../node_modules/.pnpm/libsodium-wrappers@0.7.16/node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js',
        import.meta.url,
      ).pathname,
      // Stub out Node.js-only packages so they don't pull in minipass/glob/rimraf
      '@automerge/automerge-repo-storage-nodefs': new URL('./src/stubs/nodefs-stub.ts', import.meta.url).pathname,
      // Allow importing workspace packages by source during dev
      '@federation/ui':          new URL('../ui/src/index.ts',          import.meta.url).pathname,
      '@federation/models':      new URL('../models/src/index.ts',      import.meta.url).pathname,
      '@federation/auth':        new URL('../auth/src/index.ts',        import.meta.url).pathname,
      '@federation/groups':      new URL('../groups/src/index.ts',      import.meta.url).pathname,
      '@federation/permissions': new URL('../permissions/src/index.ts', import.meta.url).pathname,
      '@federation/app':         new URL('../app/src/index.ts',         import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    include: ['libsodium-wrappers'],
    exclude: ['@automerge/automerge'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Split react into its own chunk; automerge/libp2p are auto-split by Rollup
        // since they're transitive deps and manualChunks requires direct resolvability.
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
