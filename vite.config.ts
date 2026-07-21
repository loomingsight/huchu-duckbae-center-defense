import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.PAGES_BASE_PATH ?? '/',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
