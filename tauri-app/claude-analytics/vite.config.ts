import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Vite options tailored for Tauri development
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    // Mobile development requires host to be set
    host: process.env.TAURI_DEV_HOST || false,
    hmr: process.env.TAURI_DEV_HOST
      ? {
          protocol: "ws",
          host: process.env.TAURI_DEV_HOST,
          port: 5174,
        }
      : undefined,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Build configuration
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Chunk size warning limit
    chunkSizeWarningLimit: 500,
    // Rollup options for manual chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Data fetching and state management
          'vendor-query': ['@tanstack/react-query'],
          // Charting library - large bundle
          'vendor-recharts': ['recharts'],
          // Date utilities
          'vendor-date': ['date-fns'],
          // Virtualization
          'vendor-virtual': ['@tanstack/react-virtual'],
          // D3 Sankey for flow charts
          'vendor-d3-sankey': ['d3-sankey'],
          // Markdown rendering
          'vendor-markdown': ['react-markdown', 'react-syntax-highlighter'],
          // Date picker
          'vendor-datepicker': ['react-day-picker'],
          // State management
          'vendor-zustand': ['zustand'],
          // Tauri API
          'vendor-tauri': ['@tauri-apps/api'],
        },
      },
    },
  },

  // Environment variables prefix
  envPrefix: ["VITE_", "TAURI_"],
});
