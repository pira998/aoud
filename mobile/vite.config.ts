import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Aoud',
        short_name: 'Aoud',
        description: 'Mobile interface for Aoud',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  build: {
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate React and React-DOM into their own chunk
          'react-vendor': ['react', 'react-dom'],
          // Separate icon library
          'icons': ['lucide-react'],
          // Separate diff library (if used)
          'diff-vendor': ['diff'],
          // Separate framer-motion for animations
          'animation': ['framer-motion'],
          // Separate syntax highlighting libraries (largest chunk)
          'highlight': ['highlight.js', 'marked'],
        },
      },
    },
    // Increase chunk size warning limit to 600kb (since we're splitting)
    chunkSizeWarningLimit: 600,
    // Enable minification and compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Proxy API routes to the bridge server
      '/health': {
        target: 'http://localhost:3001',
      },
      '/connection-info': {
        target: 'http://localhost:3001',
      },
      '/projects': {
        target: 'http://localhost:3001',
      },
    },
  },
});
