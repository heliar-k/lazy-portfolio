import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy chart library into its own chunk
          echarts: ['echarts', 'echarts-for-react'],
          // Split registry data (large static JSON-like output)
          registry: ['@/portfolios/registry'],
        },
      },
    },
  },
});
