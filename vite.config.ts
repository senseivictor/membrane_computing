import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        visualizer: 'visualizer.html',
        division: 'division.html',
      },
    },
  },
});
