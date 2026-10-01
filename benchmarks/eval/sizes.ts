// Adds the app size (minified JS, raw and brotli bytes) to working runs of existing result files,
// from the code saved in each run's history. No API calls.
//
//   npm run eval:sizes -- benchmarks/eval/results/<run>.json [...]
import { readFileSync, writeFileSync } from "node:fs";
import { measureApp } from "./app.ts";

for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const r of data.results) {
    const last = r.history?.at(-1);
    if (!r.ok || r.size || !last || last.errors.length) continue;
    try {
      r.size = await measureApp(r.stack, last.files);
      added++;
    } catch (e) {
      console.error(`${r.task}/${r.stack}#${r.run}: ${String(e).slice(0, 120)}`);
    }
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`${file}: ${added} sizes added`);
}
