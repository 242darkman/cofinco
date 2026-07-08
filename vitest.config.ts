
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    // Sous la suite complète en parallèle, la contention de transform (imports
    // dynamiques comme `@shared/schema`) peut faire dépasser le défaut de 5 s à
    // des tests pourtant instantanés en isolation. Marge confortable pour éviter
    // les timeouts flaky sans masquer un vrai blocage.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
      "@shared": path.resolve(__dirname, "packages/shared"),
    },
  },
});
