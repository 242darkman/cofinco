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
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
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
});
