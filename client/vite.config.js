import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CONTRACTS §0/§13: client proxies /api and /socket.io to the server on 4000. Client code must
// only ever call relative paths (/api/...) — never hardcode localhost:4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
