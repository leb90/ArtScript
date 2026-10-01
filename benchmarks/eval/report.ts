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
type Run = { task: string; stack: string; ok: boolean; attempts: number; usage: Usage; usd: number; codeTokens: number | null };
type ResultFile = { model: string; effort: string; runs: number; prices: { in: number; out: number; cacheRead: number; cacheWrite: number }; pricesDate: string; results: Run[] };

const STACKS = ["artscript", "react", "svelte"];
const NAMES: Record<string, string> = { artscript: "**ArtScript**", react: "React + TS", svelte: "Svelte 5" };
const PLAIN: Record<string, string> = { artscript: "ArtScript", react: "React + TS", svelte: "Svelte 5" };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const usd = (n: number) => `$${n.toFixed(4)}`;
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
    total: cost,
  };
}

type Loaded = { path: string; data: ResultFile; paths: string[]; replaced: string[] };

function merge(files: { path: string; data: ResultFile }[]): Loaded[] {
  const byModel = new Map<string, Loaded>();
  for (const { path, data } of files) {
    const prev = byModel.get(data.model);
    if (!prev) { byModel.set(data.model, { path, data: { ...data, results: [...data.results] }, paths: [path], replaced: [] }); continue; }
    const cells = new Set(data.results.map((r) => `${r.task}/${r.stack}`));
    const existed = new Set(prev.data.results.map((r) => `${r.task}/${r.stack}`));
    prev.data.results = [...prev.data.results.filter((r) => !cells.has(`${r.task}/${r.stack}`)), ...data.results];
    prev.paths.push(path);
    prev.replaced.push(...[...cells].filter((c) => existed.has(c)));
  }
  return [...byModel.values()];
}

// Modifications on the larger project, per context mode.
function projectTable(rs: Run[]): string[] {
  const tasks = [...new Set(rs.map((r) => r.task.split("@")[0]))];
  const cell = (stack: string, mode: string) => {
    const x = rs.filter((r) => r.stack === stack && r.task.endsWith("@" + mode));
    const ok = x.filter((r) => r.ok);
    const cost = x.reduce((a, r) => a + r.usd, 0);
    const input = avg(x.map((r) => r.usage.input + r.usage.cacheRead + r.usage.cacheWrite));
    return { text: ok.length ? `${usd(cost / ok.length)} (${ok.length}/${x.length})` : `✗ (0/${x.length})`, perSolved: ok.length ? cost / ok.length : Infinity, input };
  };
  const out = [`#### Larger project: ${tasks.length} modifications to an 11-component shop`, "",
    "Whole project in the prompt (\"full\") vs. what a good agent would read (\"focus\": ArtScript gets `art context` of the relevant parts, React/Svelte the file list plus the relevant files). Each change is applied to the whole project and the app is used in the simulated browser.", "",
    "| Stack | USD per solved task, full | USD per solved task, focus | Input tokens/run, full | Input tokens/run, focus |", "|---|---|---|---|---|"];
  for (const k of STACKS) {
    const full = cell(k, "full"), focus = cell(k, "focus");
    out.push(`| ${NAMES[k]} | ${full.text} | ${focus.text} | ${Math.round(full.input)} | ${Math.round(focus.input)} |`);
  }
  out.push("", "Input tokens include ArtScript's ~1.9K-token spec in the system prompt (mostly billed at the cache rate) and every retry.");
  return out;
}

function section(loaded: Loaded[]): string {
  const out: string[] = [START, "", "## Cost eval results", ""];
  for (const { path, data: all, paths, replaced } of loaded) {
    // Larger-project tasks ("<task>@full" / "<task>@focus") get their own table below.
    const f = { ...all, results: all.results.filter((r) => !r.task.includes("@")) };
    const project = all.results.filter((r) => r.task.includes("@"));
    const s = Object.fromEntries(STACKS.map((k) => [k, stats(f, k)]));
    const tasks = [...new Set(f.results.map((r) => r.task))];
    const date = basename(path).slice(0, 10);
    out.push(`### ${f.model} (effort ${f.effort})`, "");
    out.push(`With \`${f.model}\`, ArtScript cost **${diff(s.artscript.perSolved, s.react.perSolved)}** per solved task than React + TS and **${diff(s.artscript.perSolved, s.svelte.perSolved)}** than Svelte 5.`, "");
    out.push("| Stack | Solved | USD per solved task | vs React | Without prompt cache | Avg attempts | Output tokens / run | Final code tokens |");
    out.push("|---|---|---|---|---|---|---|---|");
    for (const k of STACKS) {
      const x = s[k];
      out.push(`| ${NAMES[k]} | ${x.ok}/${x.n} | ${k === "artscript" ? `**${usd(x.perSolved)}**` : usd(x.perSolved)} | ${k === "react" ? "—" : pct(x.perSolved, s.react.perSolved)} | ${usd(x.perSolvedNoCache)} | ${x.attempts.toFixed(2)} | ${Math.round(x.output)} | ${Math.round(x.code)} |`);
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
    const rerun = replaced.length ? ` Re-run after fixing bugs that run uncovered: ${replaced.join(", ")} (the model's first answers there were correct; the failures came from the eval harness and, for login/artscript, an ArtScript compiler bug).` : "";
    out.push("", "</details>", "");
    if (project.length) out.push(...projectTable(project), "");
    out.push(`Run ${date}: ${tasks.length} tasks × ${STACKS.length} stacks × ${f.runs} runs, total $${total.toFixed(2)}, prices as of ${f.pricesDate}.${rerun} Raw data: ${links}.`, "");
  }
  out.push("### Methodology and limitations", "",
    "- Each task is the same functional request for every stack (6 create, 2 modify). Claude gets the task, returns files, and the harness validates them: ArtScript with its compiler, React with strict `tsc`, Svelte with its compiler. Errors are fed back, up to 3 attempts.",
    "- In the 2 modify tasks each stack may use its cheapest edit format: ArtScript an `art patch`, React and Svelte search/replace edit blocks (like a coding agent's Edit tool). Full files are also accepted. Runs before 2026-10-01 had no edit formats: every stack returned full files.",
    "- Cost is computed from the real `usage` the API returns: the ArtScript spec in the system prompt, retries and thinking tokens (billed as output) all count.",
    "- ArtScript's system prompt includes its ~1.2K-token spec, which is served from the prompt cache after the first request; the \"without prompt cache\" column prices those tokens at the full input rate.",
    "- Since 2026-10-01 every app is also **run and used like a person would**: it's mounted in a simulated browser (happy-dom) and a stack-agnostic check clicks, types and reads the screen (e.g. adds and completes todos, reloads the page to check data persisted on the server). A failed check is fed back to Claude like a compiler error. Earlier runs only checked that code compiled and typechecked.",
    "- Full-stack tasks: React and Svelte also write their own `server.ts` (Node `http`, no dependencies); ArtScript uses `api`. Svelte is validated without TypeScript type checking of `.svelte` files, which favors it.",
    "- Each run uses the ArtScript spec as of its date; older runs are not redone when the spec improves. The runs above used the Spanish version of the spec; it has since been translated to English (about 6% fewer tokens).",
    "- Task prompts (and the feedback given to the model) are in Spanish; they are the fixed dataset these numbers were measured on.",
    "- 3 runs per task is an early signal, not a definitive benchmark. Reproduce it with `npm run eval`.",
    "", END);
  return out.join("\n");
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("usage: npm run eval:report -- <results.json> [...]");
  process.exit(1);
}
const files = paths.map((p) => ({ path: join(process.cwd(), p), data: JSON.parse(readFileSync(p, "utf8")) as ResultFile }));
const readme = readFileSync(README, "utf8");
const block = section(merge(files));
const next = readme.includes(START)
  ? readme.slice(0, readme.indexOf(START)) + block + readme.slice(readme.indexOf(END) + END.length)
  : readme.replace("\n## License", `\n${block}\n\n## License`);
writeFileSync(README, next);
console.log(`README.md updated with ${files.length} result file(s)`);
