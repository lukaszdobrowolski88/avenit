import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Avenit',
        short_name: 'Avenit',
        description: 'Avenit - Aplikacja do zarządzania kościołem',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#d97706',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Precache hashed assets only — NOT index.html. The HTML must never be
        // served from precache, otherwise a deploy is invisible until the SW is
        // fully replaced (the recurring "stale after deploy" bug on Safari).
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024, // 12MB — bundle rośnie (moduł Boards/AI); precache musi go objąć
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Handlery push (push/notificationclick/…) wciągamy do TEGO SAMEGO, jedynego
        // service workera zamiast rejestrować osobny /sw-push.js na scope '/'. Dwa SW na
        // jednym scope nadpisują się i psują aktualizacje (powracający stale-after-deploy).
        importScripts: ['sw-push.js'],
        // Disable the default precache navigation fallback (index.html). Otherwise
        // Workbox registers a NavigationRoute that serves the *precached* index.html
        // for every navigation, which is exactly the stale-after-deploy bug. With it
        // off, navigations fall through to the NetworkFirst rule below.
        navigateFallback: null,
        // Also drop index.html from the precache manifest entirely, so Workbox's
        // directoryIndex mapping ('/' -> index.html) can't serve a stale root either.
        manifestTransforms: [
          (entries) => ({
            manifest: entries.filter((e) => !/(^|\/)index\.html$/.test(e.url)),
            warnings: []
          })
        ],
        runtimeCaching: [
          {
            // App shell / SPA navigations: always try the network first so the
            // latest index.html (and its hashed asset refs) load right away;
            // fall back to the last cached copy only when offline.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 dni
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/vsyxhwfnjznrmkgcinyx\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 godziny
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/vsyxhwfnjznrmkgcinyx\.supabase\.co\/storage\/v1\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 dni
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ]
})
