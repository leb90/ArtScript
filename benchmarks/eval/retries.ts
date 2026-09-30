// Prints every retry in an eval result file: the code Claude wrote, the errors it got back,
// and the diff to the attempt that fixed it. Used to find spec or compiler gaps.
//
//   npm run eval:retries -- benchmarks/eval/results/<run>.json [--stack artscript]
import { readFileSync } from "node:fs";

type Attempt = { files: Record<string, string>; errors: string[] };
type Run = { task: string; stack: string; run: number; ok: boolean; history?: Attempt[]; attemptErrors?: string[][] };

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json"));
const stackIdx = args.indexOf("--stack");
const stack = stackIdx >= 0 ? args[stackIdx + 1] : null;
if (!file) {
  console.error("usage: npm run eval:retries -- <results.json> [--stack artscript]");
  process.exit(1);
}

const runs: Run[] = JSON.parse(readFileSync(file, "utf8")).results;
let found = 0;
for (const r of runs) {
  if (stack && r.stack !== stack) continue;
  // Older result files only kept the errors, not the code.
  if (!r.history) {
    for (const errs of r.attemptErrors ?? []) {
      found++;
      console.log(`\n=== ${r.task}/${r.stack}#${r.run} (errors only, no code saved) ===\n${errs.join("\n")}`);
    }
    continue;
  }
  r.history.forEach((a, i) => {
    if (!a.errors.length) return;
    found++;
    console.log(`\n=== ${r.task}/${r.stack}#${r.run} · attempt ${i + 1} ===`);
    console.log("--- errors fed back:");
    console.log(a.errors.join("\n"));
    for (const [name, src] of Object.entries(a.files)) {
      console.log(`--- ${name}:`);
      src.split("\n").forEach((l, n) => console.log(`${String(n + 1).padStart(4)}  ${l}`));
    }
    const next = r.history![i + 1];
    if (next) {
      console.log("--- changed in the next attempt:");
      for (const [name, src] of Object.entries(next.files)) {
        const before = (a.files[name] ?? "").split("\n");
        src.split("\n").forEach((l, n) => { if (before[n] !== l) console.log(`${String(n + 1).padStart(4)}+ ${l}`); });
      }
    }
  });
}
console.log(found ? `\n${found} failed attempt(s)` : "no retries");
