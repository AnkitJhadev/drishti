import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Drishti — Telecom AI Operations',
        short_name: 'Drishti',
        theme_color: '#0a0f1e',
        background_color: '#0a0f1e',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Keep the offline precache lean — the 3D scene and on-device ML engine
        // load on demand and are cached at runtime (see runtimeCaching below).
        globIgnores: ['**/TowerScene-*.js', '**/transformers-*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            // On-device model weights (Transformers.js pulls from the HF CDN).
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'onnx-model',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // ONNX Runtime Web WASM binaries (served from jsDelivr).
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'onnx-runtime',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // On-device ML engine chunk — cached on first (online) use so it's
            // available offline without bloating the initial precache.
            urlPattern: ({ url }: { url: URL }) => url.pathname.includes('/transformers-'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'onnx-engine',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ],
        // The ONNX model weights are large — don't fail SW install over the 2MB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    // Split heavy libs into separate cacheable chunks — better for
    // low-bandwidth / repeat loads on old hardware (Chanakya environments).
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet', 'react-leaflet', 'leaflet.heat'],
          charts: ['recharts'],
          net: ['axios', 'socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
