import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { faviconPlugin } from "./scripts/vite/faviconPlugin.js";

export default defineConfig({
  plugins: [vue(), faviconPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  base: "./",
  build: {
    // The same bundle is embedded into the downloadable standalone HTML.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: {
    allowedHosts: ["tpj4gl-5173.csb.app"],
  },
});
