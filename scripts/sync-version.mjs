import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid package.json version");

await writeFile(new URL("version.txt", root), `${JSON.stringify(version)}\n`);
const lockPath = new URL("package-lock.json", root);
try {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
