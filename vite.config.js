import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // This allows any host (like localtunnel URLs) to access the dev server
    allowedHosts: true, 
    host: true,
  }
});
