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
const cli = join(dirname(fileURLToPath(import.meta.resolve("@artscript/core"))), "cli.js");
process.exit(spawnSync(process.execPath, [cli, "init", ...args], { stdio: "inherit" }).status ?? 1);
