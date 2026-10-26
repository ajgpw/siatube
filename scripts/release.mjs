import { copyFile, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
const requested = args[0] || "patch";
if (args.length > 1 || !/^(?:patch|minor|major|\d+\.\d+\.\d+)$/.test(requested)) {
  throw new Error("Usage: npm run release -- [patch|minor|major|X.Y.Z]");
}
const packagePath = new URL("package.json", root);
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("Invalid package.json version");
const parts = pkg.version.split(".").map(Number);
let nextVersion = requested;
if (["patch", "minor", "major"].includes(requested)) {
  const index = { major: 0, minor: 1, patch: 2 }[requested];
  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i += 1) parts[i] = 0;
  nextVersion = parts.join(".");
}
const nextParts = nextVersion.split(".").map(Number);
const previousParts = pkg.version.split(".").map(Number);
const firstDifference = nextParts.findIndex((value, index) => value !== previousParts[index]);
if (firstDifference !== -1 && nextParts[firstDifference] < previousParts[firstDifference]) {
  throw new Error("The release version cannot be lower than the current version");
}

function npm(...command) {
  const npmCli = process.env.npm_execpath;
  const executable = npmCli ? process.execPath : "npm";
  const commandArgs = npmCli ? [npmCli, ...command] : command;
  const result = spawnSync(executable, commandArgs, {
    cwd: fileURLToPath(root),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// Verify before changing the version; no Git writes or network publishing.
npm("test");
pkg.version = nextVersion;
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
npm("run", "build");
await copyFile(new URL("dist/index.html", root), new URL("index.html.txt", root));
await copyFile(new URL("dist/siatube-full.html.txt", root), new URL("siatube-full.html.txt", root));
console.log(`Prepared v${nextVersion}: dist/, index.html.txt, siatube-full.html.txt, version.txt`);
