import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isPages = process.env.BUILD_PAGES === '1';

export default defineConfig({
  plugins: [react()],
  base: isPages ? '/jira-dashboard/' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
