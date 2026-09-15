import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { readFileSync } from "node:fs";

const readFavicon = (filename) =>
  readFileSync(path.resolve(__dirname, "favicon", filename), "utf8").trim();

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "favicon-from-text",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          const manifest = {
            name: "しあTube",
            short_name: "しあTube",
            icons: [192, 512].map((size) => ({
              src: readFavicon(`android-chrome-${size}x${size}.txt`),
              sizes: `${size}x${size}`,
              type: "image/png",
            })),
          };
          return html
            .replace(
              /href="\/favicon\/([\w-]+\.txt)"/g,
              (_, filename) => `href="${readFavicon(filename)}"`,
            )
            .replace(
              'href="/favicon/site.webmanifest"',
              `href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}"`,
            );
        },
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  base: "./", 
  server: {
    allowedHosts: ["tpj4gl-5173.csb.app"],
  },
});
