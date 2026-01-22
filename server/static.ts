import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // ========== STATIC ASSETS WITH AGGRESSIVE CACHING ==========
  // Assets have content hashes in filenames (cache-busting), so we can cache for 1 year
  // This reduces network requests by 80%+ on subsequent visits
  app.use(express.static(distPath, {
    maxAge: '1y', // Cache for 1 year (assets have hash in filename)
    etag: true,   // Enable ETag for conditional requests
    lastModified: true, // Enable Last-Modified header
    immutable: true, // Tell browsers these files never change (hash-based naming)
    index: false, // Don't serve index.html for directory requests (handled below)
    setHeaders: (res, filePath) => {
      // For JS/CSS files with hashes, use immutable caching
      if (filePath.match(/\.(js|css)$/) && filePath.includes('-')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // For fonts, also use long cache
      else if (filePath.match(/\.(woff|woff2|ttf|eot|otf)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // For images with hashes
      else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // For HTML, use short cache with revalidation
      else if (filePath.match(/\.html$/)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));

  // fall through to index.html if the file doesn't exist
  // HTML should not be cached long-term (needs fresh version for updates)
  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
