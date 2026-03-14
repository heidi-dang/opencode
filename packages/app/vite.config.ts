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
        manualChunks: {
          // PERFORMANCE: Split agent configurations for better caching
          "agent-configs": [
            "./src/context/agent.ts",
            "./src/pages/session/message-timeline.tsx"
          ],
          // PERFORMANCE: Split UI components
          "ui-components": [
            "./src/components/**/*.tsx",
            "./src/pages/**/*.tsx"
          ],
          // PERFORMANCE: Split context providers
          "context": [
            "./src/context/**/*.tsx"
          ],
          // PERFORMANCE: Split utilities
          "utils": [
            "./src/utils/**/*.ts"
          ]
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
