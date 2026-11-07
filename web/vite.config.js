import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, les appels /api sont envoyés au serveur Express (port 4000) : même origine pour le cookie de session.
// En production, Express sert le dossier dist/ lui-même (voir backend/src/app.js).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    host: true, // accessible depuis un téléphone sur le même Wi-Fi (http://IP-du-PC:5173)
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 4000}`, changeOrigin: false } },
  },
  build: {
    sourcemap: false, // pas de code source lisible en production
    chunkSizeWarningLimit: 700,
  },
});
