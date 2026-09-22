import { defineConfig } from "vite";

// Single-file offscreen bundle (crop + MiniLM).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: "src/offscreen/main.js",
      name: "SyncleOffscreen",
      formats: ["iife"],
      fileName: () => "offscreen.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
    // Transformers + ORT are large; raise warning limit.
    chunkSizeWarningLimit: 5000,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
