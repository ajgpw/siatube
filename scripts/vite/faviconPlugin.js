import { readFileSync } from "node:fs";

const faviconDirectory = new URL("../../src/assets/favicon/", import.meta.url);

function readFavicon(filename) {
  return readFileSync(new URL(filename, faviconDirectory), "utf8").trim();
}

// Inline icons so both the web build and downloadable HTML work without assets.
export function faviconPlugin() {
  return {
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
  };
}
