import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/luma': {
        target: 'https://api.lumalabs.ai',
        changeOrigin: true,
        rewrite: (path) => {
          const trimmedPath = path.replace('/api/luma', '');
          return `/v1/images/generations${trimmedPath}`;
        },
        headers: {
          'Authorization': `Bearer ${process.env.VITE_LUMA_API_KEY || ''}`
        }
      }
    }
  }
});