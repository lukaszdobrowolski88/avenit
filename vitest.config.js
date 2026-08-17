import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Harness testów web (oddzielny od vite.config.js z PWA). Watch = "pętla testowa".
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
