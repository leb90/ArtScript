// Builds the README "cost eval results" section from eval result files, so the published
// numbers always come straight from the raw data.
//
//   npm run eval:report -- benchmarks/eval/results/<run>.json [<run2>.json ...]
//
// Files of the same model are merged: a later file replaces the task/stack cells it contains
// (used to re-run cells after fixing the harness). Rewrites the block between the eval-results
// markers in README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const README = join(REPO, "README.md");
const START = "<!-- eval-results:start -->";
const END = "<!-- eval-results:end -->";

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
type Run = { task: string; stack: string; ok: boolean; attempts: number; usage: Usage; usd: number; codeTokens: number | null; size?: { raw: number; brotli: number } };
// Runs that never reached the model (API errors such as an exhausted credit balance) are not
// results: they're left out of every number and counted separately.
const notRun = (r: Run & { errors?: string[] }) => (r.attempts === 0 && /^(API \d+|budget exhausted)/.test(r.errors?.[0] ?? "")) || r.errors?.[0] === "refusal";

type ResultFile = { model: string; effort: string; runs: number; prices: { in: number; out: number; cacheRead: number; cacheWrite: number }; pricesDate: string; results: Run[] };

// Stacks shown for the model being reported: those present in its results, in this order.
const ORDER = ["artscript", "react", "svelte", "vue", "solid"];
let STACKS: string[] = ORDER;
const NAMES: Record<string, string> = { artscript: "**ArtScript**", react: "React + TS", svelte: "Svelte 5", vue: "Vue 3", solid: "SolidJS" };
const PLAIN: Record<string, string> = { artscript: "ArtScript", react: "React + TS", svelte: "Svelte 5", vue: "Vue 3", solid: "SolidJS" };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const usd = (n: number) => `$${n.toFixed(4)}`;
const kb = (n: number) => (n ? `${(n / 1024).toFixed(1)} KB` : "—");
const diff = (a: number, b: number) => `${Math.abs(Math.round((a / b - 1) * 100))}% ${a <= b ? "less" : "more"}`;
const pct = (a: number, b: number) => `${a <= b ? "−" : "+"}${Math.abs(Math.round((a / b - 1) * 100))}%`;

function stats(f: ResultFile, stack: string, task?: string) {
  const rs = f.results.filter((r) => r.stack === stack && (!task || r.task === task));
  const ok = rs.filter((r) => r.ok);
  const cost = rs.reduce((a, r) => a + r.usd, 0);
  // Same runs priced as if nothing had been served from the prompt cache.
  const p = f.prices;
  const noCache = rs.reduce((a, r) => a + r.usd + (r.usage.cacheRead * (p.in - p.cacheRead) + r.usage.cacheWrite * (p.in - p.cacheWrite)) / 1e6, 0);
  return {
    n: rs.length, ok: ok.length,
    perSolved: ok.length ? cost / ok.length : Infinity,
    perSolvedNoCache: ok.length ? noCache / ok.length : Infinity,
    attempts: avg(rs.map((r) => r.attempts)),
    output: avg(rs.map((r) => r.usage.output)),
    code: avg(ok.map((r) => r.codeTokens ?? 0)),
    brotli: avg(ok.filter((r) => r.size).map((r) => r.size!.brotli)),
    total: cost,
  };
}

// Why cells were re-run, per result file (benchmarks/eval/results/notes.json).
const NOTES: Record<string, string> = (() => {
  try { return JSON.parse(readFileSync(join(HERE, "results", "notes.json"), "utf8")); } catch { return {}; }
})();

type Loaded = { path: string; data: ResultFile; paths: string[]; replaced: string[]; reruns: string[] };

function merge(files: { path: string; data: ResultFile }[]): Loaded[] {
  const byModel = new Map<string, Loaded>();
  for (const { path, data } of files) {
    const prev = byModel.get(data.model);
    if (!prev) { byModel.set(data.model, { path, data: { ...data, results: [...data.results] }, paths: [path], replaced: [], reruns: NOTES[basename(path)] ? [`${basename(path)}: ${NOTES[basename(path)]}`] : [] }); continue; }
    const cells = new Set(data.results.map((r) => `${r.task}/${r.stack}`));
    const existed = new Set(prev.data.results.map((r) => `${r.task}/${r.stack}`));
    prev.data.results = [...prev.data.results.filter((r) => !cells.has(`${r.task}/${r.stack}`)), ...data.results];
    prev.paths.push(path);
    const rerun = [...cells].filter((c) => existed.has(c));
    prev.replaced.push(...rerun);
    if (rerun.length) prev.reruns.push(`${rerun.length} cell(s) re-run in ${basename(path)}${NOTES[basename(path)] ? ` (${NOTES[basename(path)]})` : ""}`);
    else if (NOTES[basename(path)]) prev.reruns.push(`${basename(path)}: ${NOTES[basename(path)]}`);
  }
  return [...byModel.values()];
}

// Modifications on the larger projects, one table per project, per context mode.
const PROJECTS: Record<string, string> = { shop: "an 11-component shop", admin: "a 42-component admin panel", xl: "a 102-component admin panel" };

function projectTables(rs: Run[]): string[] {
  const out: string[] = [];
  for (const project of [...new Set(rs.map((r) => r.task.split("-")[0]))]) {
    out.push(...projectTable(rs.filter((r) => r.task.startsWith(project + "-")), PROJECTS[project] ?? project), "");
  }
  return out;
}

function projectTable(rs: Run[], what: string): string[] {
  const tasks = [...new Set(rs.map((r) => r.task.split("@")[0]))];
  const cell = (stack: string, mode: string) => {
    const x = rs.filter((r) => r.stack === stack && r.task.endsWith("@" + mode));
    const ok = x.filter((r) => r.ok);
    const cost = x.reduce((a, r) => a + r.usd, 0);
    const input = avg(x.map((r) => r.usage.input + r.usage.cacheRead + r.usage.cacheWrite));
    return { text: ok.length ? `${usd(cost / ok.length)} (${ok.length}/${x.length})` : `✗ (0/${x.length})`, perSolved: ok.length ? cost / ok.length : Infinity, input };
  };
  const out = [`#### Larger project: ${tasks.length} modifications to ${what}`, "",
    "Whole project in the prompt (\"full\") vs. what a good agent would read (\"focus\": ArtScript gets `art context` of the relevant parts, React/Svelte the file list plus the relevant files). Each change is applied to the whole project and the app is used in the simulated browser.", "",
    "| Stack | USD per solved task, full | USD per solved task, focus | Input tokens/run, full | Input tokens/run, focus | App JS (brotli) |", "|---|---|---|---|---|---|"];
  for (const k of STACKS) {
    const full = cell(k, "full"), focus = cell(k, "focus");
    const sized = rs.filter((r) => r.stack === k && r.ok && r.size);
    out.push(`| ${NAMES[k]} | ${full.text} | ${focus.text} | ${Math.round(full.input)} | ${Math.round(focus.input)} | ${kb(avg(sized.map((r) => r.size!.brotli)))} |`);
  }
  out.push("", "Input tokens include ArtScript's spec in the system prompt (~1.9K tokens in the 2026-09-30 runs, ~2.7K from 2026-10-01 17:00 on, after routes and the 0.3 UI; mostly billed at the cache rate) and every retry.");
  return out;
}

// A task is reported for a model only if ArtScript, React and Svelte all ran it, so a run cut short
// (e.g. out of credit) never compares stacks on different tasks. Vue/Solid may add columns.
function comparable(results: Run[]): Run[] {
  const core = ["artscript", "react", "svelte"];
  const tasks = new Set(results.map((r) => r.task).filter((t) => core.every((k) => results.some((r) => r.task === t && r.stack === k))));
  return results.filter((r) => tasks.has(r.task));
}

// Imperative tasks ("imp-": a physics loop on a canvas) are reported apart: there a language for
// UI and data has nothing to shorten, and the question is only whether it costs the same as JS.
const imperative = (r: Run) => r.task.startsWith("imp-");
function impTable(loaded: Loaded[]): string[] {
  // Every run of every round in which the task ran on all five stacks is pooled (a round that
  // re-ran one stack alone stays in the raw data only), so each cell has the same number of runs.
  const rows = loaded.flatMap(({ data, paths }) => {
    const pooled: Run[] = [];
    for (const path of paths) {
      const rs = (JSON.parse(readFileSync(path, "utf8")) as ResultFile).results.filter((r) => imperative(r) && !notRun(r));
      if (ORDER.every((k) => rs.some((r) => r.stack === k))) pooled.push(...rs);
    }
    return pooled.length ? [{ data: { ...data, results: pooled } }] : [];
  });
  if (!rows.length) return [];
  const out = ["### Imperative code: a canvas with animation and physics", "", "One task where almost all the code is a physics loop (gravity, walls, elastic collisions, drawing): the kind of app where ArtScript is JavaScript with another syntax for statements. Reported apart from the tables above, which are apps of UI and data. USD per solved task (solved runs / runs):", "", "Two rounds of two runs per cell, pooled: four runs per cell. Between them, ArtScript's cells alone were re-run three times while the harness was being fixed (at first it rejected an answer that put the physics in a `.ts` module imported with `use`); those re-runs stay in the raw data and aren't in the table, so every stack has the same runs. No model moved the physics to a `.ts` file by itself, even with the spec suggesting it; Haiku's retries were its own errors (a typo, an effect that changed a state it read).", "", "**What closes the gap (measured, ArtScript only, two runs per cell, 2026-10-09):** the extra cost was the model deliberating in a less familiar syntax (650–1,600 output tokens of thinking per run, against ~10–600 in React) plus retries. With a project rule that puts the physics in a `.ts` file imported with `use` (what a new project's `AGENTS.md` says) and the core spec with a whole app as the example (`docs/SPEC-CORE.md`, ~1,600 tokens instead of 3,400), every model wrote `sim.ts` + `app.art` at the first attempt with React-level thinking: Sonnet $0.0227 (React $0.0209), Opus $0.0618 (React $0.0634), Haiku $0.0084 (React $0.0110). With the spec read from the prompt cache, as in a session: $0.0167, $0.049 and $0.0084. New projects get that rule and the core spec. The core spec was then measured on all 50 tasks (ArtScript cells only, two runs, 2026-10-09, files `12-22-28` Sonnet, `13-4*` Haiku and Opus): Sonnet $0.0092 per solved task against $0.0088 with the full spec (101/102 solved), Haiku $0.0088 against $0.0088 (90/102), Opus $0.0239 against $0.0220 (102/102); the same results and no cheaper, so the tables above keep the full spec and new projects read it first, with the core spec as the shorter option for a small or a canvas app. The retries those runs showed became tolerances of the compiler (`async fn`, `login private`, `event` in actions, an unawaited api call inside `try` named as an error).", "", `| Model | ${ORDER.map((k) => NAMES[k]).join(" | ")} | ArtScript vs React |`, `|---|${ORDER.map(() => "---").join("|")}|---|`];
  for (const { data } of rows) {
    const rs = data.results.filter(imperative);
    const cell = (k: string) => { const x = rs.filter((r) => r.stack === k), ok = x.filter((r) => r.ok).length; return { n: x.length, ok, per: ok ? x.reduce((a, r) => a + r.usd, 0) / ok : Infinity }; };
    const art = cell("artscript"), react = cell("react");
    out.push(`| ${data.model} | ${ORDER.map((k) => { const c = cell(k); return c.n ? `${k === "artscript" ? `**${usd(c.per)}**` : usd(c.per)} (${c.ok}/${c.n})` : "—"; }).join(" | ")} | **${pct(art.per, react.per)}** |`);
  }
  return [...out, ""];
}

function section(loaded: Loaded[]): string {
  const out: string[] = [START, "", "## Cost eval results", ""];
  const imp = impTable(loaded);
  for (const l of loaded) l.data = { ...l.data, results: l.data.results.filter((r) => !imperative(r)) };
  // Every task of each model in one table (the sections below split small apps from larger projects).
  out.push("All tasks, USD per solved task (solved runs / runs):", "", `| Model | ${ORDER.map((k) => NAMES[k]).join(" | ")} | ArtScript vs React |`, `|---|${ORDER.map(() => "---").join("|")}|---|`);
  for (const { data } of loaded) {
    const rs = comparable(data.results);
    const cell = (k: string) => {
      const x = rs.filter((r) => r.stack === k), ok = x.filter((r) => r.ok).length;
      return { n: x.length, ok, per: ok ? x.reduce((a, r) => a + r.usd, 0) / ok : Infinity };
    };
    const art = cell("artscript"), react = cell("react");
    out.push(`| ${data.model} | ${ORDER.map((k) => { const c = cell(k); return c.n ? `${k === "artscript" ? `**${usd(c.per)}**` : usd(c.per)} (${c.ok}/${c.n})` : "—"; }).join(" | ")} | **${pct(art.per, react.per)}** |`);
  }
  out.push("");
  for (const { path, data: all, paths, reruns } of loaded) {
    // Larger-project tasks ("<task>@full" / "<task>@focus") get their own table below.
    all.results = comparable(all.results);
    STACKS = ORDER.filter((k) => all.results.some((r) => r.stack === k));
    const f = { ...all, results: all.results.filter((r) => !r.task.includes("@")) };
    const project = all.results.filter((r) => r.task.includes("@"));
    const s = Object.fromEntries(STACKS.map((k) => [k, stats(f, k)]));
    const tasks = [...new Set(f.results.map((r) => r.task))];
    const date = basename(path).slice(0, 10);
    out.push(`### ${f.model} (${f.model.startsWith("claude-haiku") ? "no effort setting" : `effort ${f.effort}`})`, "");
    out.push(`With \`${f.model}\`, ArtScript cost **${diff(s.artscript.perSolved, s.react.perSolved)}** per solved task than React + TS and **${diff(s.artscript.perSolved, s.svelte.perSolved)}** than Svelte 5.`, "");
    out.push("| Stack | Solved | USD per solved task | vs React | Without prompt cache | Avg attempts | Output tokens / run | Final code tokens | App JS (brotli) |");
    out.push("|---|---|---|---|---|---|---|---|---|");
    for (const k of STACKS) {
      const x = s[k];
      out.push(`| ${NAMES[k]} | ${x.ok}/${x.n} | ${k === "artscript" ? `**${usd(x.perSolved)}**` : usd(x.perSolved)} | ${k === "react" ? "—" : pct(x.perSolved, s.react.perSolved)} | ${usd(x.perSolvedNoCache)} | ${x.attempts.toFixed(2)} | ${Math.round(x.output)} | ${Math.round(x.code)} | ${kb(x.brotli)} |`);
    }
    const max = Math.max(...STACKS.map((k) => s[k].perSolved));
    out.push("", "```mermaid", "xychart-beta", `    title "USD per solved task (${f.model})"`, `    x-axis [${STACKS.map((k) => `"${PLAIN[k]}"`).join(", ")}]`,
      `    y-axis "USD" 0 --> ${(Math.ceil(max * 1.2 * 1000) / 1000).toFixed(3)}`, `    bar [${STACKS.map((k) => s[k].perSolved.toFixed(4)).join(", ")}]`, "```", "");
    out.push("<details><summary>Per task</summary>", "", `| Task | ${STACKS.map((k) => PLAIN[k]).join(" | ")} |`, `|---|${STACKS.map(() => "---").join("|")}|`);
    for (const t of tasks) {
      out.push(`| ${t} | ${STACKS.map((k) => {
        const x = stats(f, k, t);
        return x.ok ? `${usd(x.perSolved)} (${x.ok}/${x.n})` : `✗ (0/${x.n})`;
      }).join(" | ")} |`);
    }
    const total = STACKS.reduce((a, k) => a + s[k].total, 0);
    const links = paths.map((p) => `[\`${relative(REPO, p)}\`](${relative(REPO, p)})`).join(", ");
    const rerun = reruns.length ? ` ${reruns.join("; ")}.` : "";
    out.push("", "</details>", "");
    if (project.length) out.push(...projectTables(project));
    out.push(`Run ${date}: ${tasks.length} tasks × ${STACKS.length} stacks × ${f.runs} runs, total $${total.toFixed(2)}, prices as of ${f.pricesDate}.${rerun} Raw data: ${links}.`, "");
  }
  out.push(...imp);
  out.push("### Methodology and limitations", "",
    "- **The 2026-10-02 measurement** (the numbers above): 50 tasks, three models, five stacks, two runs per task. Before it, a pilot ran ArtScript alone once per model (USD 2.34, files `2026-10-02T16-1*`); what the models tripped on was fixed in the compiler (accepting what they write, clearer errors, a `for` statement) and the measurement started from that version. Haiku then solved 76/100 ArtScript runs, against 86–89 in the other stacks; two more rounds of the same kind of fixes followed, and its ArtScript cells were run again each time (80/100, then 90/100, the one reported). React, Svelte, Vue and Solid ran once: their toolchains didn't change. Sonnet's and Opus's ArtScript cells ran once, between those rounds. Every answer of every run is in the raw data, and `--replay` re-checks them with the current compiler.",
    "- Each task is the same functional request for every stack: small apps created from scratch (some full-stack), small modifications, and modifications to larger generated projects (11, 42 and 102 components). Claude gets the task, returns files, and the harness validates them: ArtScript with its compiler, React and SolidJS with strict `tsc`, Svelte and Vue with their compilers. Errors are fed back, up to 3 attempts.",
    "- In modification tasks each stack may use its cheapest edit format: ArtScript an `art patch`, React and Svelte search/replace edit blocks (like a coding agent's Edit tool). Full files are also accepted. Runs before 2026-10-01 had no edit formats: every stack returned full files.",
    "- Cost is computed from the real `usage` the API returns: the ArtScript spec in the system prompt, retries and thinking tokens (billed as output) all count.",
    "- ArtScript's system prompt includes its spec (1.2K–3.2K tokens depending on the run date; 3.2K in the 2026-10-02 measurement), which is served from the prompt cache after the first request; the \"without prompt cache\" column prices those tokens at the full input rate.",
    "- Since 2026-10-01 every app is also **run and used like a person would**: it's mounted in a simulated browser (happy-dom) and a stack-agnostic check clicks, types and reads the screen (e.g. adds and completes todos, reloads the page to check data persisted on the server). A failed check is fed back to Claude like a compiler error. Earlier runs only checked that code compiled and typechecked.",
    "- Full-stack tasks: the other stacks also write their own `server.ts` (Node `http`, no dependencies, data in memory); ArtScript uses `api`, which also persists to SQLite. Svelte is validated without TypeScript type checking of `.svelte` files, which favors it.",
    "- Since 2026-10-01 18:47, ArtScript modification tasks get docs/SPEC-EDIT.md (~800 tokens) instead of the full spec; creation tasks keep the full spec. Earlier runs sent the full spec everywhere.",
    "- Each run uses the ArtScript spec as of its date (in English since 2026-10-02).",
    "- A model refusal (Opus, on the photo-upload task: twice in React, once in Vue) is not a result: it is left out, and re-run when the run is resumed.",
    "- Task prompts (and the feedback given to the model) are in Spanish; they are the fixed dataset these numbers were measured on.",
    "- App JS: each working app bundled with esbuild (minified, production mode) and compressed with brotli: the JavaScript a browser downloads. ArtScript's includes its runtime; React's includes React DOM; Svelte's includes its client runtime.",
    "- Two runs per task is a signal, not a definitive benchmark: the smaller the model, the more its results move between runs (Haiku's ArtScript cells went 76, 80, 90 out of 100 as the compiler improved, and part of that is noise). Reproduce it with `npm run eval`; `npm run eval -- --dry-run` checks the harness and every reference app offline, and `--replay <results.json>` re-checks stored answers with the current compiler.",
    "", END);
  return out.join("\n");
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("usage: npm run eval:report -- <results.json> [...]");
  process.exit(1);
}
const files = paths.map((p) => {
  const data = JSON.parse(readFileSync(p, "utf8")) as ResultFile;
  const skipped = data.results.filter(notRun).length;
  if (skipped) console.log(`${basename(p)}: ${skipped} run(s) never reached the model (API errors or the --max-usd cap), left out`);
  return { path: join(process.cwd(), p), data: { ...data, results: data.results.filter((r) => !notRun(r)) } };
});
const readme = readFileSync(README, "utf8");
const block = section(merge(files));
const next = readme.includes(START)
  ? readme.slice(0, readme.indexOf(START)) + block + readme.slice(readme.indexOf(END) + END.length)
  : readme.replace("\n## License", `\n${block}\n\n## License`);
writeFileSync(README, next);
console.log(`README.md updated with ${files.length} result file(s)`);
