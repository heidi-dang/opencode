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
          if (id.includes("node_modules")) {
            if (id.includes("remeda")) return "vendor-remeda"
            if (id.includes("zod")) return "vendor-zod"
            if (id.includes("solid-js")) return "vendor-solid"
            if (id.includes("@kobalte")) return "vendor-kobalte"
            if (id.includes("fuzzysort")) return "vendor-fuzzysort"
            return "vendor"
          }

          if (id.includes("/context/agent") || id.includes("/message-timeline")) {
            return "agent-configs"
          }
          if (id.includes("/components/") || id.includes("/pages/")) {
            return "ui-components"
          }
          if (id.includes("/context/") && !id.includes("/context/agent")) {
            return "context"
          }
          if (id.includes("/utils/")) {
            return "utils"
          }
        },
      },
    },
    // PERFORMANCE: Optimize chunk size and loading
    chunkSizeWarningLimit: 1000,
    minify: "terser",
    terserOptions: {
      compress: {
        // PERFORMANCE: Remove console.log in production but preserve error/warn for debugging
        drop_console: ["log", "debug", "trace"],
        drop_debugger: true,
      },
    },
  },
  // PERFORMANCE: Optimize dependencies
  optimizeDeps: {
    include: ["solid-js", "@solidjs/router", "@kobalte/core", "@opencode-ai/ui"],
  },
})
