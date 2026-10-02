// Runs the behavior check of the given tasks against their reference apps (benchmarks/eval/refs),
// without the rest of the dry run:
//   node benchmarks/eval/check-refs.ts pagination wizard [--stacks react,vue]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { behave } from "./behavior.ts";
import { TASKS } from "./tasks.ts";
import type { Stack } from "./validate.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--stacks");
const stacks = at >= 0 ? args[at + 1].split(",") : ["artscript", "react", "svelte", "vue", "solid"];
const ids = args.filter((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1));
const refs = join(dirname(fileURLToPath(import.meta.url)), "refs");
let failed = 0;
for (const id of ids.length ? ids : readdirSync(refs)) {
  const task = TASKS.find((t) => t.id === id);
  if (!task) { console.log(`✗ unknown task ${id}`); failed++; continue; }
  for (const stack of stacks) {
    const dir = join(refs, id, stack);
    if (!existsSync(dir)) { console.log(`· no reference for ${id}/${stack}`); continue; }
    const files = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
    const errs = await behave(task, stack as Stack, files);
    if (errs.length) failed++;
    console.log(`${errs.length ? "✗" : "✓"} ${id}/${stack}${errs.length ? ": " + errs[0] : ""}`);
  }
}
if (failed) process.exitCode = 1;
