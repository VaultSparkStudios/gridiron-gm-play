import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || '/gridiron-gm-play/',
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('phaser')) return 'phaser';
        },
      },
    },
  },
});
