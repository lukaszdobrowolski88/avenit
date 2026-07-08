import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // W dev: proxy /api do lokalnego backendu.
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:3009', changeOrigin: true },
    },
  },
});
