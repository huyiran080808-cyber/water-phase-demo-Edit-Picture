import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/water-phase-demo-Edit-Picture/' : '/',
  plugins: [react()],
  server: {
    allowedHosts: ['.lhr.life', '.localhost.run'],
  },
});
