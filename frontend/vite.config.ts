import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Required for Docker
    // HMR configuration for Docker on Windows
    hmr: {
      host: process.env.VITE_HMR_HOST || 'localhost',
      port: 5173,
      protocol: 'ws',
    },
    // Watch configuration for Docker file system (especially Windows)
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      interval: parseInt(process.env.CHOKIDAR_INTERVAL || '1000'),
    },
    proxy: {
      // Proxy API requests to backend in development
      // VITE_PROXY_TARGET: Docker uses 'http://backend:3001', local dev uses 'http://localhost:3001'
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          state: ['zustand'],
        },
      },
    },
  },
})
