import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'ui'),
  build: {
    outDir: path.resolve(__dirname, 'dist/ui'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3847',
      '/ws': {
        target: 'ws://localhost:3847',
        ws: true,
      },
    },
  },
});
