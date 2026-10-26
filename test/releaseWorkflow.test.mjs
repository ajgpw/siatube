import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "siatube-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  for (const name of ["release.mjs", "sync-version.mjs"]) {
    await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, "scripts", name));
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3" }));
  await writeFile(join(root, "package-lock.json"), JSON.stringify({
    version: "1.2.3", packages: { "": { version: "1.2.3" }, "node_modules/example": { version: "9.8.7" } },
  }));
  // Simulate npm's lifecycle while exercising the real release orchestrator and
  // version synchronizer without recursively running this test suite.
  const npmCli = join(root, "npm-fixture.mjs");
  await writeFile(npmCli, `
    import { appendFile, access, mkdir, readFile, writeFile } from 'node:fs/promises';
    const args = process.argv.slice(2);
    await appendFile('commands.txt', args.join(' ') + '\\n');
    if (args[0] === 'test') {
      try { await access('fail-test'); process.exit(1); } catch {}
    } else if (args.join(' ') === 'run build') {
      await import('./scripts/sync-version.mjs');
      const { version } = JSON.parse(await readFile('package.json', 'utf8'));
      await mkdir('dist', { recursive: true });
      await writeFile('dist/index.html', '<html>web ' + version + '</html>');
      await writeFile('dist/siatube-full.html.txt', '<html>standalone ' + version + '</html>');
    } else { process.exit(1); }
  `);
  const run = (...args) => exec(process.execPath, [join(root, "scripts/release.mjs"), ...args], {
    cwd: root,
    env: { ...process.env, npm_execpath: npmCli },
  });
  return { root, run };
}

test("release bumps patch by default, synchronizes metadata and exports matching artifacts", async (t) => {
  const { root, run } = await fixture(t);
  await run();
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "1.2.4");
  assert.equal(JSON.parse(await readFile(join(root, "version.txt"))), "1.2.4");
  const lock = JSON.parse(await readFile(join(root, "package-lock.json")));
  assert.equal(lock.version, "1.2.4");
  assert.equal(lock.packages[""].version, "1.2.4");
  assert.equal(lock.packages["node_modules/example"].version, "9.8.7");
  assert.equal(await readFile(join(root, "commands.txt"), "utf8"), "test\nrun build\n");
  for (const [source, target] of [["index.html", "index.html.txt"], ["siatube-full.html.txt", "siatube-full.html.txt"]]) {
    assert.equal(await readFile(join(root, target), "utf8"), await readFile(join(root, "dist", source), "utf8"));
  }
  // A rebuild with an explicit version does not accidentally increment twice.
  await run("1.2.4");
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "1.2.4");
});

test("minor and major releases reset the lower version components", async (t) => {
  const { root, run } = await fixture(t);
  await run("minor");
  assert.equal(JSON.parse(await readFile(join(root, "version.txt"))), "1.3.0");
  await run("major");
  assert.equal(JSON.parse(await readFile(join(root, "version.txt"))), "2.0.0");
});

test("failed tests leave the package version and distribution files untouched", async (t) => {
  const { root, run } = await fixture(t);
  await writeFile(join(root, "fail-test"), "");
  await writeFile(join(root, "siatube-full.html.txt"), "previous release");
  await assert.rejects(run("patch"));
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "1.2.3");
  assert.equal(await readFile(join(root, "siatube-full.html.txt"), "utf8"), "previous release");
  assert.equal(await readFile(join(root, "commands.txt"), "utf8"), "test\n");
});

test("invalid arguments and downgrades are rejected before running commands", async (t) => {
  const { root, run } = await fixture(t);
  for (const args of [["invalid"], ["1.2.2"], ["patch", "extra"]]) {
    await assert.rejects(run(...args));
  }
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "1.2.3");
  await assert.rejects(readFile(join(root, "commands.txt")), { code: "ENOENT" });
});
