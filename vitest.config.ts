import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    test: {
      environment: 'node',
      include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      alias: {
        '@shared': path.resolve(__dirname, './shared'),
        '@client': path.resolve(__dirname, './client/src'),
        '@server': path.resolve(__dirname, './server'),
      },
      env,
      hookTimeout: 30000,
      testTimeout: 30000,
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, './shared'),
      },
    },
  };
});
