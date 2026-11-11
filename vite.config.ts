import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: {
    outDir: resolve("dist/web"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        login: resolve("web/login.ts"),
        approve: resolve("web/approve.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
