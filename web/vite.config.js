import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, les appels /api sont envoyés au serveur Express (port 4000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // accessible depuis un téléphone sur le même Wi-Fi (http://IP-du-PC:5173)
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
