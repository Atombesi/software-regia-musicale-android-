import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 'base: ./' assicura che Electron trovi i file js/css
  base: './', 
  build: {
    outDir: 'dist', 
    emptyOutDir: true,
  },
});