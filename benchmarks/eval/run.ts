// Real cost eval: Claude solves the same tasks in ArtScript, React+TS and Svelte.
// Main metric: USD per solved task, counting the spec,
// retries and thinking tokens (billed as output).
//
//   npm run eval -- --dry-run                     validates the harness without calling the API
//   npm run eval -- --runs 3 --max-usd 10         full run with claude-opus-5-5
//   npm run eval -- --model claude-sonnet-5-5 --tasks counter,todo --stacks artscript,react
//
// Credentials: ANTHROPIC_API_KEY in the environment or in a .env file at the repo root.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS, type Task } from "./tasks.ts";
import { analyze } from "../../src/checker.ts";
import { parseProject } from "../../src/compile.ts";
import { declContext, projectMap } from "../../src/context.ts";
import { formatAI } from "../../src/errors.ts";
import { applyPatch } from "../../src/patch.ts";
import { behave } from "./behavior.ts";
import { applyEdits, extractFiles, extractPatch, validate, type Files, type Stack } from "./validate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
// Behavior checks swap in happy-dom's globals (including fetch) while an app runs; API calls to
// Claude must keep using Node's own fetch or an in-flight request dies with the simulated window.
const nodeFetch = globalThis.fetch;
const REPO = join(HERE, "..", "..");
const STACKS: Stack[] = ["artscript", "react", "svelte"];

// USD per million tokens. Source: claude-api skill model table (cached 2026-09-25).
// Cache writes (5 min TTL) = 1.25x the input price.
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
const PRICES_DATE = "2026-09-25";

// ---------- arguments ----------
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MODEL = opt("model", "claude-opus-5-5");
const EFFORT = opt("effort", "medium") as "low" | "medium" | "high" | "xhigh" | "max";
const RUNS = Number(opt("runs", "3"));
const MAX_ATTEMPTS = Number(opt("attempts", "3"));
const MAX_USD = Number(opt("max-usd", "10"));
const CONCURRENCY = Number(opt("concurrency", "4"));
const TASK_IDS = opt("tasks", TASKS.map((t) => t.id).join(",")).split(",");
const STACK_IDS = opt("stacks", STACKS.join(",")).split(",") as Stack[];
const DRY = args.includes("--dry-run");
// Behavior checks run each app in a simulated browser; --no-behavior only checks that it compiles.
const BEHAVIOR = !args.includes("--no-behavior");

// ---------- prompts ----------
const FORMAT = "Respondé SOLO con los archivos completos, cada uno en un bloque de código cuyo encabezado es el nombre del archivo, por ejemplo:\n```App.tsx\n...\n```\nSin explicaciones.";

function systemPrompt(stack: Stack): string {
  if (stack === "artscript") {
    const spec = readFileSync(join(REPO, "docs", "SPEC.md"), "utf8");
    return `Sos un desarrollador web experto. Stack: ArtScript. Todo el código va en app.art. ${FORMAT}\n\nSpec completa de ArtScript:\n\n${spec}`;
  }
  if (stack === "react") {
    return `Sos un desarrollador web experto. Stack: React 19 + TypeScript (TSX), componentes funcionales y hooks, estilos con clases de Tailwind. Todo en un solo archivo App.tsx con export default. ${FORMAT}`;
  }
  return `Sos un desarrollador web experto. Stack: Svelte 5 con runes ($state, $derived, $props) y <script lang="ts">, estilos con clases de Tailwind. El componente raíz es App.svelte; otros componentes van en archivos .svelte aparte. ${FORMAT}`;
}

function baseFiles(task: Task, stack: Stack): Files {
  if (!task.base && !task.project) return {};
  const dir = task.project ? join(HERE, "projects", task.project, stack) : join(REPO, "benchmarks", "tasks", task.base!, stack);
  return Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
}

// Modification tasks: each stack may answer with its cheapest edit format instead of full files.
// ArtScript uses `art patch` (documented in its spec); React/Svelte use search/replace blocks,
// like the Edit tool of coding agents.
const EDIT_HINT: Record<Stack, string> = {
  artscript: "Respondé con un bloque ```patch (art patch, ver la spec) con los cambios, o con los archivos completos si lo preferís.",
  react: "Respondé con bloques de edición, o con los archivos completos si lo preferís. Formato de edición (el texto SEARCH debe coincidir exactamente y una sola vez):\n```edit App.tsx\n<<<<<<< SEARCH\ntexto original\n=======\ntexto nuevo\n>>>>>>> REPLACE\n```",
  svelte: "Respondé con bloques de edición, o con los archivos completos si lo preferís. Formato de edición (el texto SEARCH debe coincidir exactamente y una sola vez):\n```edit App.svelte\n<<<<<<< SEARCH\ntexto original\n=======\ntexto nuevo\n>>>>>>> REPLACE\n```",
};

// Full-stack tasks: ArtScript uses its `api`; React and Svelte write their own Node server.
const FULLSTACK_HINT: Record<Stack, string> = {
  artscript: "Es una app full-stack: usá `api` (ver la spec) para el backend.",
  react: "Es una app full-stack. Además de App.tsx, escribí server.ts: un servidor Node con node:http (sin dependencias externas) que escuche en process.env.PORT y exponga bajo /api/ lo que necesites, guardando los datos en memoria. El frontend lo llama con rutas relativas (fetch(\"/api/...\")). No sirvas archivos estáticos.",
  svelte: "Es una app full-stack. Además de App.svelte, escribí server.ts: un servidor Node con node:http (sin dependencias externas) que escuche en process.env.PORT y exponga bajo /api/ lo que necesites, guardando los datos en memoria. El frontend lo llama con rutas relativas (fetch(\"/api/...\")). No sirvas archivos estáticos.",
};

const fence = (files: Files) => Object.entries(files).map(([n, s]) => `\`\`\`${n}\n${s}\`\`\``).join("\n\n");

// Larger project: the whole project ("full"), or what a good agent would read ("focus").
function projectPrompt(task: Task, stack: Stack): string {
  const files = baseFiles(task, stack);
  const tail = `Tarea: ${task.prompt}\n\n${EDIT_HINT[stack]}`;
  if (task.context === "full") return `Proyecto actual (todos los archivos):\n\n${fence(files)}\n\n${tail}`;
  const focus = task.focus![stack];
  if (stack === "artscript") {
    const { program } = parseProject(Object.entries(files).map(([file, src]) => ({ file, src })));
    const a = analyze(program);
    const parts = focus.map((name) => `$ art context ${name}\n${declContext(program, a, name)}`);
    return `Mapa del proyecto (art context):\n${projectMap(program, a)}\n\nContexto de las partes relevantes:\n\n${parts.join("\n\n")}\n\n${tail}`;
  }
  const relevant = Object.fromEntries(focus.map((n) => [n, files[n]]));
  return `Archivos del proyecto: ${Object.keys(files).join(", ")}\n\nArchivos relevantes:\n\n${fence(relevant)}\n\n${tail}`;
}

function userPrompt(task: Task, stack: Stack): string {
  if (task.fullstack) return `Tarea: ${task.prompt}\n\n${FULLSTACK_HINT[stack]}`;
  if (task.project) return projectPrompt(task, stack);
  const base = baseFiles(task, stack);
  const code = Object.entries(base).map(([n, s]) => `\`\`\`${n}\n${s}\`\`\``).join("\n\n");
  return code ? `Código actual:\n\n${code}\n\nTarea: ${task.prompt}\n\n${EDIT_HINT[stack]}` : `Tarea: ${task.prompt}`;
}

// Applies a patch / edit answer to the task's base files; null if the answer has none.
function applyEditAnswer(task: Task, stack: Stack, text: string): { files: Files } | { errors: string[] } | null {
  if (!task.base && !task.project) return null;
  const base = baseFiles(task, stack);
  if (stack === "artscript") {
    const patch = extractPatch(text);
    if (patch === null) return null;
    const r = applyPatch(Object.entries(base).map(([file, src]) => ({ file, src })), patch);
    return r.diagnostics.length ? { errors: r.diagnostics.map(formatAI) } : { files: r.files };
  }
  return text.includes("```edit ") ? applyEdits(base, text) : null;
}

// ---------- cost ----------
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
const zero = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

function usd(u: Usage): number {
  const p = PRICES[MODEL];
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}

// ---------- one run: task × stack ----------
type RunResult = {
  task: string; stack: Stack; run: number; ok: boolean; attempts: number; usage: Usage; usd: number;
  codeTokens: number | null; errors: string[]; stop?: string;
  // Every attempt: the files Claude returned and the errors fed back (empty on the last successful one).
  // Lets retries be diagnosed exactly: `npm run eval:retries -- <results.json>`.
  history: { files: Files; errors: string[]; edit?: string }[]; // `edit`: the patch/edit answer, when used
};

let spent = 0;

async function runOne(client: Anthropic, task: Task, stack: Stack, run: number): Promise<RunResult> {
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt(stack), cache_control: { type: "ephemeral" } }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(task, stack) }];
  const usage = zero();
  let errors: string[] = [];
  let files: Files = {};
  let stop: string | undefined;
  const history: { files: Files; errors: string[]; edit?: string }[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (spent >= MAX_USD) { errors = [`budget exhausted (--max-usd ${MAX_USD})`]; return done(false, attempt - 1); }
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      // Haiku 4.5 doesn't accept effort; 5.x models do (Opus 5.5 defaults to medium).
      ...(MODEL.startsWith("claude-haiku") ? {} : { output_config: { effort: EFFORT } }),
    });
    const u: Usage = {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cacheRead: res.usage.cache_read_input_tokens ?? 0,
      cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
    };
    for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] += u[k];
    spent += usd(u);
    stop = res.stop_reason ?? undefined;
    if (res.stop_reason === "refusal") { errors = ["refusal"]; return done(false, attempt); }

    // Append-only history with the full content (including thinking blocks).
    messages.push({ role: "assistant", content: res.content });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const edited = applyEditAnswer(task, stack, text);
    if (edited && "errors" in edited) { files = {}; errors = edited.errors; }
    // Full files returned for a modification replace those files; the rest of the project stays.
    else { files = edited ? edited.files : { ...baseFiles(task, stack), ...extractFiles(text) }; errors = await validate(stack, files); }
    if (!errors.length && BEHAVIOR) errors = await behave(task, stack, files);
    history.push({ files, errors: errors.slice(0, 10), ...(edited ? { edit: text } : {}) });
    if (!errors.length) return done(true, attempt);
    const fix = edited ? "Devolvé el cambio corregido (se aplica sobre el código original)." : "Devolvé los archivos completos corregidos.";
    messages.push({ role: "user", content: `El código tiene errores:\n${errors.join("\n")}\n\n${fix}` });
  }
  return done(false, MAX_ATTEMPTS);

  async function done(ok: boolean, attempts: number): Promise<RunResult> {
    let codeTokens: number | null = null;
    if (ok) codeTokens = await countCodeTokens(client, files);
    return { task: task.id, stack, run, ok, attempts, usage, usd: usd(usage), codeTokens, errors: ok ? [] : errors.slice(0, 5), stop, history };
  }
}

// Final code tokens with the model's real tokenizer (count_tokens endpoint).
let overhead: number | null = null;
async function countCodeTokens(client: Anthropic, files: Files): Promise<number> {
  const count = async (text: string) => (await client.messages.countTokens({ model: MODEL, messages: [{ role: "user", content: text }] })).input_tokens;
  overhead ??= await count(".");
  return (await count(Object.values(files).join("\n"))) - overhead + 1;
}

// ---------- execution ----------
async function pool<T>(items: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await items[k]();
    }
  }));
  return out;
}

function summarize(results: RunResult[]): string {
  const rows: string[] = [];
  const by = (s: Stack) => results.filter((r) => r.stack === s);
  const stats = STACK_IDS.map((s) => {
    const rs = by(s);
    const ok = rs.filter((r) => r.ok);
    const sum = (f: (r: RunResult) => number) => rs.reduce((a, r) => a + f(r), 0);
    const cost = sum((r) => r.usd);
    return {
      s, n: rs.length, ok: ok.length, cost,
      perSolved: ok.length ? cost / ok.length : Infinity,
      attempts: rs.length ? sum((r) => r.attempts) / rs.length : 0,
      input: sum((r) => r.usage.input + r.usage.cacheRead + r.usage.cacheWrite) / (rs.length || 1),
      output: sum((r) => r.usage.output) / (rs.length || 1),
      code: ok.length ? ok.reduce((a, r) => a + (r.codeTokens ?? 0), 0) / ok.length : 0,
    };
  });
  const react = stats.find((x) => x.s === "react");
  rows.push(`Modelo: ${MODEL} · effort: ${MODEL.startsWith("claude-haiku") ? "n/a" : EFFORT} · runs per task: ${RUNS} · max attempts: ${MAX_ATTEMPTS} · prices: ${PRICES_DATE}`, "");
  rows.push("| Stack | Solved | Avg attempts | Input tokens/run | Output tokens/run | Final code tokens | USD total | **USD per solved task** | vs React |");
  rows.push("|---|---|---|---|---|---|---|---|---|");
  for (const x of stats) {
    const vs = react && x.s !== "react" && isFinite(x.perSolved) && isFinite(react.perSolved) ? `${Math.round((x.perSolved / react.perSolved - 1) * 100)}%` : "—";
    rows.push(`| ${x.s} | ${x.ok}/${x.n} | ${x.attempts.toFixed(2)} | ${Math.round(x.input)} | ${Math.round(x.output)} | ${Math.round(x.code)} | $${x.cost.toFixed(4)} | **$${isFinite(x.perSolved) ? x.perSolved.toFixed(4) : "∞"}** | ${vs} |`);
  }
  rows.push("", "Per task (USD per solved task):", "", `| Task | ${STACK_IDS.join(" | ")} |`, `|---|${STACK_IDS.map(() => "---").join("|")}|`);
  for (const t of TASK_IDS) {
    const cells = STACK_IDS.map((s) => {
      const rs = results.filter((r) => r.task === t && r.stack === s);
      const ok = rs.filter((r) => r.ok).length;
      const c = rs.reduce((a, r) => a + r.usd, 0);
      return ok ? `$${(c / ok).toFixed(4)} (${ok}/${rs.length})` : `✗ (0/${rs.length})`;
    });
    rows.push(`| ${t} | ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
}

async function dryRun() {
  console.log("dry-run: validates the harness without calling the API\n");
  for (const task of ["counter", "todo"]) {
    for (const stack of STACK_IDS) {
      const files = baseFiles({ id: task, prompt: "", base: task }, stack);
      const errs = await validate(stack, files);
      console.log(`${errs.length ? "✗" : "✓"} reference ${task}/${stack}${errs.length ? ": " + errs.join(" | ") : ""}`);
    }
  }
  const broken: Record<Stack, Files> = {
    artscript: { "app.art": "page A {\n  state n = 0\n  text m\n}\n" },
    react: { "App.tsx": "export default function App() { const n: number = 'x'; return <div>{n}</div>; }\n" },
    svelte: { "App.svelte": "<script lang=\"ts\">let n = $state(0)</script>\n{#if n}<p>x</p>\n" },
  };
  for (const stack of STACK_IDS) {
    const errs = await validate(stack, broken[stack]);
    console.log(`${errs.length ? "✓" : "✗"} catches an error in ${stack}: ${errs[0] ?? "NOT CAUGHT"}`);
  }
  const todoMod = TASKS.find((t) => t.id === "todo-mod")!;
  const answers: Record<Stack, string> = {
    artscript: "```patch\ninsert after Todos/column/for\n  button \"Borrar completadas\" -> todos = todos.filter(t => !t.done)\n```",
    react: "```edit Todos.tsx\n<<<<<<< SEARCH\n      <h2>Tareas</h2>\n=======\n      <h2>Tareas</h2>\n      <button onClick={() => setTodos([])}>Borrar</button>\n>>>>>>> REPLACE\n```",
    svelte: "```edit Todos.svelte\n<<<<<<< SEARCH\n  <h2>Tareas</h2>\n=======\n  <h2>Tareas</h2>\n  <button onclick={() => (todos = [])}>Borrar</button>\n>>>>>>> REPLACE\n```",
  };
  for (const stack of STACK_IDS) {
    const r = applyEditAnswer(todoMod, stack, answers[stack]);
    const errs = !r ? ["no se detectó la edición"] : "errors" in r ? r.errors : await validate(stack, r.files);
    console.log(`${errs.length ? "✗" : "✓"} edit applied and valid in ${stack}${errs.length ? ": " + errs[0] : ""}`);
  }
  const bad = applyEditAnswer(todoMod, "react", "```edit Todos.tsx\n<<<<<<< SEARCH\nno existe\n=======\nx\n>>>>>>> REPLACE\n```");
  console.log(`${bad && "errors" in bad ? "✓" : "✗"} catches a missing SEARCH text`);
  // Behavior checks against reference solutions: proves the harness itself works for every stack.
  const refs: [string, string, Stack][] = [];
  for (const t of ["counter", "todo"]) for (const st of STACK_IDS) refs.push([t, join(REPO, "benchmarks", "tasks", t, st), st]);
  const refRoot = join(HERE, "refs");
  if (existsSync(refRoot)) for (const t of readdirSync(refRoot)) for (const st of readdirSync(join(refRoot, t)) as Stack[]) if (STACK_IDS.includes(st)) refs.push([t, join(refRoot, t, st), st]);
  for (const [t, dir, st] of refs) {
    const task = TASKS.find((x) => x.id === t)!;
    const files = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
    const errs = await behave(task, st, files);
    console.log(`${errs.length ? "✗" : "✓"} behavior ${t}/${st}${errs.length ? ": " + errs[0] : ""}`);
  }
  // The larger project works as written in every stack.
  for (const st of STACK_IDS) {
    const dir = join(HERE, "projects", "shop", st);
    const files = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
    const errs = await behave({ id: "shop-base", prompt: "" }, st, files);
    console.log(`${errs.length ? "✗" : "✓"} behavior shop (base project)/${st}${errs.length ? ": " + errs[0] : ""}`);
  }
  // Reference patches for the project tasks: they apply and pass the task's behavior check.
  const patchDir = join(HERE, "refs", "shop");
  if (existsSync(patchDir)) {
    const dir = join(HERE, "projects", "shop", "artscript");
    const sources = readdirSync(dir).map((f) => ({ file: f, src: readFileSync(join(dir, f), "utf8") }));
    for (const f of readdirSync(patchDir)) {
      const id = f.replace(/\.patch$/, "");
      const r = applyPatch(sources, readFileSync(join(patchDir, f), "utf8"));
      const errs = r.diagnostics.length ? r.diagnostics.map(formatAI) : await behave({ id, prompt: "" }, "artscript", r.files);
      console.log(`${errs.length ? "✗" : "✓"} reference patch ${id}/artscript${errs.length ? ": " + errs[0] : ""}`);
    }
  }
  // And a buggy app must fail, with a message that says what was expected.
  const buggy = { "app.art": readFileSync(join(REPO, "examples", "counter", "app.art"), "utf8").replace("count * 2", "count * 3") };
  const caught = await behave(TASKS.find((x) => x.id === "counter")!, "artscript", buggy);
  console.log(`${caught.length ? "✓" : "✗"} catches a buggy app: ${caught[0]?.slice(0, 110) ?? "NOT CAUGHT"}`);
  const text = "```app.art\npage A {\n}\n```\nnada\n```App.tsx\nx\n```";
  console.log(`✓ file extraction: ${Object.keys(extractFiles(text)).join(", ")}`);
  const calls = TASK_IDS.length * STACK_IDS.length * RUNS;
  console.log(`\nplan: ${TASK_IDS.length} tasks × ${STACK_IDS.length} stacks × ${RUNS} runs = ${calls} runs (≥ ${calls} API calls)`);
  console.log(`model ${MODEL}, spending cap --max-usd ${MAX_USD}`);
}

// `--prompt-sizes`: prints the user prompt size of each project task, per stack (no API calls).
async function promptSizes() {
  const { getEncoding } = await import("js-tiktoken");
  const enc = getEncoding("o200k_base");
  console.log(`${"task".padEnd(22)} ${STACK_IDS.map((s) => s.padStart(10)).join(" ")}   (o200k tokens of the user prompt)`);
  for (const t of TASKS.filter((x) => x.project && TASK_IDS.includes(x.id))) {
    console.log(`${t.id.padEnd(22)} ${STACK_IDS.map((s) => String(enc.encode(userPrompt(t, s)).length).padStart(10)).join(" ")}`);
  }
}

async function main() {
  if (args.includes("--prompt-sizes")) return promptSizes();
  if (!PRICES[MODEL]) throw new Error(`modelo sin precio cargado: ${MODEL}. Disponibles: ${Object.keys(PRICES).join(", ")}`);
  if (DRY) return dryRun();
  if (existsSync(join(REPO, ".env"))) process.loadEnvFile(join(REPO, ".env"));
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("Missing ANTHROPIC_API_KEY (in the environment or in .env at the repo root). Try first: npm run eval -- --dry-run");
    process.exit(1);
  }
  const client = new Anthropic({ fetch: nodeFetch, timeout: 120_000 }); // a stuck request fails (and is retried) instead of stalling the run
  const tasks = TASKS.filter((t) => TASK_IDS.includes(t.id));
  const jobs = tasks.flatMap((t) => STACK_IDS.flatMap((s) => Array.from({ length: RUNS }, (_, r) => async () => {
    try {
      const res = await runOne(client, t, s, r + 1);
      console.log(`${res.ok ? "✓" : "✗"} ${t.id}/${s}#${r + 1}  attempts ${res.attempts}  $${res.usd.toFixed(4)}  (total $${spent.toFixed(2)})${res.ok ? "" : "  " + res.errors[0]}`);
      return res;
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : String(e);
      console.log(`✗ ${t.id}/${s}#${r + 1}  ${msg}`);
      return { task: t.id, stack: s, run: r + 1, ok: false, attempts: 0, usage: zero(), usd: 0, codeTokens: null, errors: [msg], history: [] } as RunResult;
    }
  })));
  console.log(`${jobs.length} runs, model ${MODEL}, cap $${MAX_USD}\n`);
  const results = await pool(jobs, CONCURRENCY);

  const summary = summarize(results);
  console.log("\n" + summary);
  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  writeFileSync(join(outDir, `${stamp}-${MODEL}.json`), JSON.stringify({ model: MODEL, effort: EFFORT, runs: RUNS, maxAttempts: MAX_ATTEMPTS, prices: PRICES[MODEL], pricesDate: PRICES_DATE, results }, null, 2) + "\n");
  writeFileSync(join(outDir, `${stamp}-${MODEL}.md`), `# Cost eval ${stamp}\n\n${summary}\n`);
  console.log(`\nresults → benchmarks/eval/results/${stamp}-${MODEL}.{json,md}`);
}

await main();
