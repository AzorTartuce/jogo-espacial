import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permite acesso de outros dispositivos na rede
    proxy: {
      // Em dev, encaminha o WebSocket para o servidor de salas (npm run server)
      '/ws': {
        target: 'http://localhost:8787',
        ws: true,
      },
    },
  },
});
