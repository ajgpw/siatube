import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

test("single HTML build inlines local assets and preserves external script and style tags", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "siatube-single-html-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = join(root, "scripts");
  const dist = join(root, "dist");
  await Promise.all([mkdir(scripts), mkdir(join(dist, "assets"), { recursive: true })]);
  const scriptPath = join(scripts, "build-single-html.mjs");
  await copyFile(new URL("../scripts/build-single-html.mjs", import.meta.url), scriptPath);

  const externalTags = [
    '<script async data-goatcounter="https://stats.example/count" src="//gc.zgo.at/count.js"></script>',
    '<script defer src="https://cdn.example/analytics.js" integrity="sha256-example" crossorigin="anonymous"></script>',
    '<link rel="stylesheet" href="//cdn.example/theme.css" media="screen">',
    '<link rel="stylesheet" href="https://cdn.example/fonts.css" crossorigin="anonymous">',
  ];
  const html = `<!doctype html><html><head>
<link rel="stylesheet" crossorigin href="./assets/app.css">
${externalTags.join("\n")}
</head><body><div id="app"></div>
<script type="module" crossorigin src="./assets/app.js"></script>
</body></html>`;
  await Promise.all([
    writeFile(join(dist, "index.html"), html),
    writeFile(join(dist, "assets", "app.js"), 'console.log("</script>");'),
    writeFile(join(dist, "assets", "app.css"), ".ambient-light { opacity: 0.65; }"),
  ]);

  await run(process.execPath, [scriptPath], { cwd: root });
  const output = await readFile(join(dist, "siatube-full.html.txt"), "utf8");
  assert.ok(output.includes('<script type="module">console.log("<\\/script>");</script>'));
  assert.ok(output.includes("<style>.ambient-light { opacity: 0.65; }</style>"));
  assert.ok(!output.includes('src="./assets/app.js"'));
  assert.ok(!output.includes('href="./assets/app.css"'));
  for (const tag of externalTags) {
    assert.ok(output.includes(tag), `external tag and its attributes remain intact: ${tag}`);
  }
  assert.ok(output.includes('<div id="app"></div>'));
  assert.equal(await readFile(join(dist, "index.html"), "utf8"), html);
});
