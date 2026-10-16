import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Harness testów web (oddzielny od vite.config.js z PWA). Watch = "pętla testowa".
export default defineConfig({
  plugins: [react()],
  // Test parytetu czatu importuje logikę mobilki (TS). Mobilka jest poza workspace'ami (własne
  // node_modules z Expo), więc jej tsconfig („extends: expo/tsconfig.base”) nie rozwiąże się bez
  // instalacji mobilki — esbuild nie czyta tsconfigów (web to JS, ustawienia nie są potrzebne).
  esbuild: { tsconfigRaw: '{}' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
