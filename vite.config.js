import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || '/gridiron-gm-play/',
});
