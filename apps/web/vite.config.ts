import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import path from 'path';

const resolve = createRequire(import.meta.url).resolve;
const latinFont = normalizePath(resolve('@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2'));

export default defineConfig({
  plugins: [react(), {
    name: 'preload-source-serif',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, { server }) {
        const href = server ? `/@fs/${latinFont}` : normalizePath(path.relative(__dirname, latinFont));
        return [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href } }];
      },
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          ui: ['lucide-react'],
          store: ['zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});

