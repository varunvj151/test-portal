import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-fallback',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      const indexHtml = path.resolve(dist, 'index.html');
      if (!fs.existsSync(indexHtml)) return;
      const htmlContent = fs.readFileSync(indexHtml, 'utf-8');

      const routes = [
        '404',
        'login',
        'home',
        'rules',
        'language',
        'contest',
        'admin',
        'admin/login',
        'admin/dashboard',
      ];

      for (const route of routes) {
        const filePath = path.resolve(dist, `${route}.html`);
        const dirPath = path.resolve(dist, route);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, htmlContent, 'utf-8');
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(path.resolve(dirPath, 'index.html'), htmlContent, 'utf-8');
      }

      // Also copy vercel.json if present
      const srcVercelJson = path.resolve(__dirname, 'vercel.json');
      if (fs.existsSync(srcVercelJson)) {
        fs.copyFileSync(srcVercelJson, path.resolve(dist, 'vercel.json'));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

