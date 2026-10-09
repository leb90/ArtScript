#!/usr/bin/env node
// npm create artscript@latest my-app [-- --template todo]: runs `art init` of @artscript/core.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith("-")) {
  console.error("usage: npm create artscript@latest <name> [-- --template todo|blog|users|notes|catalog|crm]");
  process.exit(1);
}
// `npm exec` with an explicit version spec resolves @latest against the registry every time;
// resolving the package from this package's own dependencies would reuse whatever npx cached.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["exec", "--yes", "--package=@artscript/core@latest", "--", "art", "init", ...args], { stdio: "inherit", shell: process.platform === "win32" });
if (r.error) {
  // No npm on the PATH (unusual): fall back to the copy this package installed.
  const cli = join(dirname(fileURLToPath(import.meta.resolve("@artscript/core"))), "cli.js");
  process.exit(spawnSync(process.execPath, [cli, "init", ...args], { stdio: "inherit" }).status ?? 1);
}
process.exit(r.status ?? 1);
