import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
  /**
   * Pre-bundle every dependency at server start.
   *
   * Left to discover them, Vite re-optimises the moment it meets an import its
   * initial scan missed — a lazy `jspdf` on the reports page, for instance. A
   * re-optimisation changes the `?v=` hash on every dependency URL, so a page
   * that loaded moments earlier is left requesting URLs the server now answers
   * with 504, and it goes blank until the next reload. Declaring them here
   * makes the optimiser finish before the server accepts traffic, which is what
   * the launcher waits on.
   */
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'framer-motion',
      'recharts',
      'axios',
      '@tanstack/react-query',
      '@tanstack/react-table',
      'lucide-react',
      'jspdf',
      'jspdf-autotable',
    ],
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          data: ['@tanstack/react-query', '@tanstack/react-table', 'axios'],
        },
      },
    },
  },
});
