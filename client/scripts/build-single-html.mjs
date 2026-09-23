import { readFile, writeFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
let html = await readFile(new URL("index.html", dist), "utf8");
const scriptPattern = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
for (const match of [...html.matchAll(scriptPattern)]) {
  const source = await readFile(new URL(match[1], dist), "utf8");
  html = html.replace(match[0], () => `<script type="module">${source.replace(/<\/script/gi, "<\\/script")}</script>`);
}
const stylePattern = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g;
for (const match of [...html.matchAll(stylePattern)]) {
  const source = await readFile(new URL(match[1], dist), "utf8");
  html = html.replace(match[0], () => `<style>${source}</style>`);
}
await writeFile(new URL("../../siatube-full.html.txt", import.meta.url), html);
