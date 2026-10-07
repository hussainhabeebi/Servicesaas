import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Reuse the repository's Wrangler bundler rather than introducing a test-only build dependency.
const appRequire = createRequire(new URL("../packages/app/package.json", import.meta.url));
const wranglerRequire = createRequire(appRequire.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const directory = mkdtempSync(join(tmpdir(), "serviceos-portals-"));
try {
  const outfile = join(directory, "portals.test.mjs");
  await build({ entryPoints: ["tests/portals.test.ts"], bundle: true, platform: "node", format: "esm", outfile });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
