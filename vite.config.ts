import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  optimizeDeps: {
    exclude: ['pyodide'],
    include: ['jszip', 'pdf-lib']
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    fs: {
      allow: ['..']
    },
    port: 5173,
    host: true
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'pyodide': ['pyodide'],
          'wasm': ['jszip', 'pdf-lib'],
          'vendor': ['react', 'react-dom'],
          'ui': ['lucide-react', 'tailwindcss']
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  preview: {
    port: 4173,
    host: true
  }
});