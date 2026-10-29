import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em produção o app roda sob /trilhas-app (atrás do proxy do Life Hub); em dev, na raiz.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/trilhas-app/' : '/',
  plugins: [react()],
  server: { host: true, port: 5173, proxy: { '/api': 'http://127.0.0.1:4300' } },
}));
