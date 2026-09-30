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
import { extractFiles, validate, type Files, type Stack } from "./validate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
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
  if (!task.base) return {};
  const dir = join(REPO, "benchmarks", "tasks", task.base, stack);
  return Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
}

function userPrompt(task: Task, stack: Stack): string {
  const base = baseFiles(task, stack);
  const code = Object.entries(base).map(([n, s]) => `\`\`\`${n}\n${s}\`\`\``).join("\n\n");
  return code ? `Código actual:\n\n${code}\n\nTarea: ${task.prompt}` : `Tarea: ${task.prompt}`;
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
  attemptErrors: string[][]; // errors fed back after each failed attempt, to improve the spec
};

let spent = 0;

async function runOne(client: Anthropic, task: Task, stack: Stack, run: number): Promise<RunResult> {
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt(stack), cache_control: { type: "ephemeral" } }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(task, stack) }];
  const usage = zero();
  let errors: string[] = [];
  let files: Files = {};
  let stop: string | undefined;
  const attemptErrors: string[][] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (spent >= MAX_USD) { errors = [`presupuesto agotado (--max-usd ${MAX_USD})`]; return done(false, attempt - 1); }
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
    files = extractFiles(text);
    errors = await validate(stack, files);
    if (!errors.length) return done(true, attempt);
    attemptErrors.push(errors.slice(0, 10));
    messages.push({ role: "user", content: `El código tiene errores:\n${errors.join("\n")}\n\nDevolvé los archivos completos corregidos.` });
  }
  return done(false, MAX_ATTEMPTS);

  async function done(ok: boolean, attempts: number): Promise<RunResult> {
    let codeTokens: number | null = null;
    if (ok) codeTokens = await countCodeTokens(client, files);
    return { task: task.id, stack, run, ok, attempts, usage, usd: usd(usage), codeTokens, errors: ok ? [] : errors.slice(0, 5), stop, attemptErrors };
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
  rows.push(`Modelo: ${MODEL} · effort: ${MODEL.startsWith("claude-haiku") ? "n/a" : EFFORT} · corridas por tarea: ${RUNS} · intentos máx.: ${MAX_ATTEMPTS} · precios: ${PRICES_DATE}`, "");
  rows.push("| Stack | Resueltas | Intentos prom. | Tokens entrada/corrida | Tokens salida/corrida | Tokens código final | USD total | **USD por tarea resuelta** | vs React |");
  rows.push("|---|---|---|---|---|---|---|---|---|");
  for (const x of stats) {
    const vs = react && x.s !== "react" && isFinite(x.perSolved) && isFinite(react.perSolved) ? `${Math.round((x.perSolved / react.perSolved - 1) * 100)}%` : "—";
    rows.push(`| ${x.s} | ${x.ok}/${x.n} | ${x.attempts.toFixed(2)} | ${Math.round(x.input)} | ${Math.round(x.output)} | ${Math.round(x.code)} | $${x.cost.toFixed(4)} | **$${isFinite(x.perSolved) ? x.perSolved.toFixed(4) : "∞"}** | ${vs} |`);
  }
  rows.push("", "Por tarea (USD por tarea resuelta):", "", `| Tarea | ${STACK_IDS.join(" | ")} |`, `|---|${STACK_IDS.map(() => "---").join("|")}|`);
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
  console.log("dry-run: valida el harness sin llamar a la API\n");
  for (const task of ["counter", "todo"]) {
    for (const stack of STACK_IDS) {
      const files = baseFiles({ id: task, prompt: "", base: task }, stack);
      const errs = await validate(stack, files);
      console.log(`${errs.length ? "✗" : "✓"} referencia ${task}/${stack}${errs.length ? ": " + errs.join(" | ") : ""}`);
    }
  }
  const broken: Record<Stack, Files> = {
    artscript: { "app.art": "page A {\n  state n = 0\n  text m\n}\n" },
    react: { "App.tsx": "export default function App() { const n: number = 'x'; return <div>{n}</div>; }\n" },
    svelte: { "App.svelte": "<script lang=\"ts\">let n = $state(0)</script>\n{#if n}<p>x</p>\n" },
  };
  for (const stack of STACK_IDS) {
    const errs = await validate(stack, broken[stack]);
    console.log(`${errs.length ? "✓" : "✗"} detecta error en ${stack}: ${errs[0] ?? "NO DETECTÓ"}`);
  }
  const text = "```app.art\npage A {\n}\n```\nnada\n```App.tsx\nx\n```";
  console.log(`✓ extracción de archivos: ${Object.keys(extractFiles(text)).join(", ")}`);
  const calls = TASK_IDS.length * STACK_IDS.length * RUNS;
  console.log(`\nplan: ${TASK_IDS.length} tareas × ${STACK_IDS.length} stacks × ${RUNS} corridas = ${calls} corridas (≥ ${calls} llamadas a la API)`);
  console.log(`modelo ${MODEL}, tope de gasto --max-usd ${MAX_USD}`);
}

async function main() {
  if (!PRICES[MODEL]) throw new Error(`modelo sin precio cargado: ${MODEL}. Disponibles: ${Object.keys(PRICES).join(", ")}`);
  if (DRY) return dryRun();
  if (existsSync(join(REPO, ".env"))) process.loadEnvFile(join(REPO, ".env"));
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("Falta ANTHROPIC_API_KEY (en el entorno o en .env en la raíz del repo). Probá primero: npm run eval -- --dry-run");
    process.exit(1);
  }
  const client = new Anthropic();
  const tasks = TASKS.filter((t) => TASK_IDS.includes(t.id));
  const jobs = tasks.flatMap((t) => STACK_IDS.flatMap((s) => Array.from({ length: RUNS }, (_, r) => async () => {
    try {
      const res = await runOne(client, t, s, r + 1);
      console.log(`${res.ok ? "✓" : "✗"} ${t.id}/${s}#${r + 1}  intentos ${res.attempts}  $${res.usd.toFixed(4)}  (acumulado $${spent.toFixed(2)})${res.ok ? "" : "  " + res.errors[0]}`);
      return res;
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : String(e);
      console.log(`✗ ${t.id}/${s}#${r + 1}  ${msg}`);
      return { task: t.id, stack: s, run: r + 1, ok: false, attempts: 0, usage: zero(), usd: 0, codeTokens: null, errors: [msg], attemptErrors: [] } as RunResult;
    }
  })));
  console.log(`${jobs.length} corridas, modelo ${MODEL}, tope $${MAX_USD}\n`);
  const results = await pool(jobs, CONCURRENCY);

  const summary = summarize(results);
  console.log("\n" + summary);
  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  writeFileSync(join(outDir, `${stamp}-${MODEL}.json`), JSON.stringify({ model: MODEL, effort: EFFORT, runs: RUNS, maxAttempts: MAX_ATTEMPTS, prices: PRICES[MODEL], pricesDate: PRICES_DATE, results }, null, 2) + "\n");
  writeFileSync(join(outDir, `${stamp}-${MODEL}.md`), `# Eval de costo ${stamp}\n\n${summary}\n`);
  console.log(`\nresultados → benchmarks/eval/results/${stamp}-${MODEL}.{json,md}`);
}

await main();
