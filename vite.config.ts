import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "server": path.resolve(import.meta.dirname, "server"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),

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

          // PDF/Excel generation
          if (id.includes('jspdf') || id.includes('xlsx') || id.includes('html2canvas')) {
            return 'export-tools';
          }

          // Radix UI components
          if (id.includes('@radix-ui')) {
            return 'radix-ui';
          }

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
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
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
