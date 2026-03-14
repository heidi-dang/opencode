import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    // sourcemap: true,
    // PERFORMANCE: Implement bundle splitting for better caching
    rollupOptions: {
      output: {
        // Use function-based config instead of glob patterns for reliability
        manualChunks(id) {
          // Skip node_modules
          if (id.includes('node_modules')) return undefined
          
          // Split agent configs
          if (id.includes('/context/agent') || id.includes('/message-timeline')) {
            return 'agent-configs'
          }
          // Split UI components
          if (id.includes('/components/') || id.includes('/pages/')) {
            return 'ui-components'
          }
          // Split context providers (excluding agent)
          if (id.includes('/context/') && !id.includes('/context/agent')) {
            return 'context'
          }
          // Split utilities
          if (id.includes('/utils/')) {
            return 'utils'
          }
          return undefined
        }
      }
    },
    // PERFORMANCE: Optimize chunk size and loading
    chunkSizeWarningLimit: 1000,
    minify: "terser",
    terserOptions: {
      compress: {
        // PERFORMANCE: Remove console logs in production
        drop_console: true,
        drop_debugger: true,
      }
    }
  },
  // PERFORMANCE: Optimize dependencies
  optimizeDeps: {
    include: [
      "solid-js",
      "@solidjs/router",
      "@kobalte/core",
      "@opencode-ai/ui"
    ]
  }
})
