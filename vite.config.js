import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Path aliases keep imports predictable as the app moves to a feature-based
// layout (avoids ../../../ chains). Dev server stays on 5173 (preview + client
// portal tooling assume it).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@features': path.resolve(__dirname, './src/features'),
      '@config': path.resolve(__dirname, './src/config'),
    },
  },
});
