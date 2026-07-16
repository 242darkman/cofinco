import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { metaImagesPlugin } from "./vite-plugin-meta-images";
import { VitePWA } from "vite-plugin-pwa";

import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    metaImagesPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'brand/**/*', 'icons/*.png'],
      manifest: false, // Use external manifest.json
      workbox: {
        // Precache all static assets
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff,woff2}'
        ],
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'],
        // Runtime caching strategies
        runtimeCaching: [
          // Identité du tenant (branding + feature flags) : JAMAIS servie depuis
          // le cache. Une config périmée changerait la marque et les modules
          // visibles à l'écran. NetworkOnly, placée en tête pour être prioritaire
          // sur le catch-all NetworkFirst plus bas.
          {
            urlPattern: /^\/api\/tenant\/config/i,
            handler: 'NetworkOnly',
          },
          // P2.5: Lightweight stats - StaleWhileRevalidate for instant display on 3G
          {
            urlPattern: /^\/api\/dashboard\/stats-light/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'stats-light-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 2 // 2 minutes (short for lightweight data)
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // P2.5: Client list - StaleWhileRevalidate for quick navigation
          {
            urlPattern: /^\/api\/clients(\?.*)?$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'clients-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // P2.5: Credits list - StaleWhileRevalidate
          {
            urlPattern: /^\/api\/credits(\?.*)?$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'credits-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // API calls - Network first with cache fallback (reduced timeout for 3G)
          {
            urlPattern: /^\/api\/(?!auth|session|dashboard\/stats-light).*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              networkTimeoutSeconds: 5, // P2.5: Reduced from 10s to 5s for faster cache fallback
              cacheableResponse: {
                statuses: [0, 200]
              },
              backgroundSync: {
                name: 'api-queue',
                options: {
                  maxRetentionTime: 24 * 60 // 24 hours in minutes
                }
              }
            }
          },
          // Static lookup data - Cache first (rarely changes)
          {
            urlPattern: /^\/api\/(agences|regions|departements|parametres|roles)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lookup-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Dashboard & Stats - Stale while revalidate
          {
            urlPattern: /^\/api\/(dashboard|stats|analytics)/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'stats-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Images - Cache first
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          // Storage files (documents, attachments)
          {
            urlPattern: /^\/api\/storage\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'storage-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Leaflet tiles for maps
          {
            urlPattern: /^https:\/\/[a-z]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ],
        // Skip waiting and claim clients immediately
        skipWaiting: true,
        clientsClaim: true,
        // Clean up old caches
        cleanupOutdatedCaches: true,
        // Offline fallback
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//]
      },
      // Development options
      devOptions: {
        // Avoid stale Workbox registrations in local dev: Vite serves source files
        // directly, while the generated SW expects a production precache.
        enabled: false,
        type: 'module'
      }
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "apps/web/src"),
      "@shared": path.resolve(import.meta.dirname, "packages/shared"),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname, "apps/web"),

  // ========== BUILD OPTIMIZATION FOR SLOW CONNECTIONS ==========
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,

    // Use esbuild for faster builds (default in Vite 5+)
    minify: 'esbuild',

    // Disable source maps in production to reduce bundle size
    sourcemap: false,

    // Target modern browsers for smaller bundles
    target: 'es2020',

    // Chunk size warning threshold
    chunkSizeWarningLimit: 500,

    // Report compressed sizes
    reportCompressedSize: true,

    // P1.4: Module preload optimization for critical chunks
    // This injects <link rel="modulepreload"> for dynamically imported modules
    modulePreload: {
      // Preload all direct imports (improves time to interactive)
      polyfill: true,
      // Customize which modules to preload based on entry point
      resolveDependencies: (_filename, deps, _context) => {
        // Always preload core dependencies for faster initial render
        const criticalChunks = ['react-core', 'react-dom', 'query', 'radix-ui', 'icons'];
        return deps.filter(dep => {
          // Preload critical chunks immediately
          if (criticalChunks.some(chunk => dep.includes(chunk))) {
            return true;
          }
          // Don't preload heavy optional chunks (will be loaded on demand)
          const heavyChunks = ['charts', 'maps', 'export-tools', 'animations'];
          if (heavyChunks.some(chunk => dep.includes(chunk))) {
            return false;
          }
          return true;
        });
      },
    },

    // Rollup options for code splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: (id) => {
          // React core - loaded first, cached separately
          if (id.includes('node_modules/react-dom')) {
            return 'react-dom';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) {
            return 'react-core';
          }

          // TanStack Query - state management
          if (id.includes('@tanstack/react-query')) {
            return 'query';
          }

          // Heavy UI libraries - load on demand
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts';
          }
          if (id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'maps';
          }
          if (id.includes('framer-motion')) {
            return 'animations';
          }

          // Form libraries
          if (id.includes('react-hook-form') || id.includes('@hookform')) {
            return 'forms';
          }

          // Date utilities
          if (id.includes('date-fns')) {
            return 'date-utils';
          }

          // PDF/Excel generation (lazy loaded on export only)
          if (id.includes('jspdf') || id.includes('exceljs') || id.includes('html2canvas')) {
            return 'export-tools';
          }

          // Dexie (IndexedDB wrapper - defer loading)
          if (id.includes('dexie')) {
            return 'offline-storage';
          }

          // Radix UI reste dans vendor : un chunk dédié crée un cycle
          // (vaul → @radix-ui/react-dialog → react-remove-scroll → vendor)

          // Lucide icons
          if (id.includes('lucide-react')) {
            return 'icons';
          }

          // Other node_modules go to vendor
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },

        // Optimize chunk file names with content hash
        chunkFileNames: (chunkInfo) => {
          // Use shorter names for common chunks
          const name = chunkInfo.name || 'chunk';
          return `assets/${name}-[hash].js`;
        },
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Organize assets by type
          const name = assetInfo.name || '';
          if (name.match(/\.(woff|woff2|ttf|eot|otf)$/)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          if (name.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },

      // Tree-shaking optimization
      treeshake: {
        moduleSideEffects: 'no-external',
        propertyReadSideEffects: false,
      },
    },

    // CSS code splitting
    cssCodeSplit: true,

    // Inline assets smaller than 4KB
    assetsInlineLimit: 4096,
  },

  // ========== DEVELOPMENT SERVER ==========
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
        // Ensure cookies are properly forwarded through the proxy
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Rewrite Set-Cookie domain for local development
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map((cookie: string) =>
                cookie.replace(/Domain=[^;]+;?/gi, '').replace(/Secure;?/gi, '')
              );
            }
          });
        },
      },
      "/ws": {
        target: "ws://localhost:5000",
        ws: true,
        configure: (proxy) => {
          const ignorableErrors = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE'];
          const isIgnorable = (err: any) =>
            ignorableErrors.includes(err.code) ||
            ignorableErrors.some(code => err.message?.includes(code));

          // Override emit to suppress benign WebSocket errors before Vite logs them
          const originalEmit = proxy.emit.bind(proxy);
          (proxy as any).emit = function(event: string, ...args: any[]) {
            if (event === 'error' && args[0] && isIgnorable(args[0])) {
              return false; // Suppress the error event entirely
            }
            return originalEmit(event as any, ...args);
          };

          // Also handle socket errors on connections
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', () => {}); // Silently handle
          });
          proxy.on('open', (proxySocket) => {
            proxySocket.on('error', () => {}); // Silently handle
          });
        },
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },

  // ========== OPTIMIZATION ==========
  optimizeDeps: {
    // Pre-bundle these dependencies for faster dev startup
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'wouter',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'date-fns',
      'zod',
      // Fix lodash ESM/CJS compatibility (used by recharts)
      'lodash',
      'lodash/get',
      'lodash/isEqual',
      'lodash/isFunction',
      'lodash/isNil',
      'lodash/isString',
      'lodash/throttle',
      'lodash/debounce',
      'recharts',
      'react-window',
      // Fix leaflet ESM compatibility with react-leaflet v5
      'leaflet',
      'react-leaflet',
    ],
    // Exclude large libraries that should be loaded on demand
    exclude: [
      'jspdf',
      'xlsx',
    ],
  },

  // ========== PREVIEW SERVER (for testing production builds) ==========
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
