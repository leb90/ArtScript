// Mide el código fuente de tareas equivalentes en ArtScript, React+TS y Svelte.
// Solo mide tamaño de fuente. NO mide todavía: tokens de la spec, iteraciones de un agente ni costo en USD
// (ver ARTSCRIPT_VIABILIDAD.md §12). Esos números salen del eval con agentes, que es el próximo paso.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS = join(HERE, "tasks");
const STACKS = ["artscript", "react", "svelte"] as const;

type Counter = { name: string; count: (s: string) => number; exact: boolean };

// Usa un tokenizer real si está instalado (`npm i -D js-tiktoken`); si no, estima chars/4 y lo marca.
async function tokenizer(): Promise<Counter> {
  try {
    const mod: any = await import("js-tiktoken" as string);
    const enc = mod.getEncoding("o200k_base");
    return { name: "o200k_base (js-tiktoken)", count: (s) => enc.encode(s).length, exact: true };
  } catch {
    return { name: "ESTIMACIÓN chars/4 (instalar js-tiktoken para medir)", count: (s) => Math.ceil(s.length / 4), exact: false };
  }
}

function readStack(dir: string): string {
  return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).sort().map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
}

export async function runBench() {
  const tok = await tokenizer();
  const results: Record<string, Record<string, { bytes: number; lines: number; tokens: number }>> = {};
  for (const task of readdirSync(TASKS).sort()) {
    results[task] = {};
    for (const stack of STACKS) {
      const src = readStack(join(TASKS, task, stack));
      results[task][stack] = { bytes: Buffer.byteLength(src), lines: src.trimEnd().split("\n").length, tokens: tok.count(src) };
    }
  }

  console.log(`tokenizer: ${tok.name}\n`);
  console.log(`${"tarea".padEnd(10)} ${"stack".padEnd(10)} ${"bytes".padStart(7)} ${"líneas".padStart(7)} ${"tokens".padStart(7)} ${"vs react".padStart(9)}`);
  for (const [task, r] of Object.entries(results)) {
    for (const stack of STACKS) {
      const x = r[stack];
      const vs = stack === "react" ? "—" : `${Math.round((x.tokens / r.react.tokens - 1) * 100)}%`;
      console.log(`${task.padEnd(10)} ${stack.padEnd(10)} ${String(x.bytes).padStart(7)} ${String(x.lines).padStart(7)} ${String(x.tokens).padStart(7)} ${vs.padStart(9)}`);
    }
  }
  console.log("\nSolo tamaño de fuente. Falta: spec en contexto, iteraciones de agente y costo USD (ver §12).");

  const out = join(HERE, "results");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "latest.json"), JSON.stringify({ date: new Date().toISOString(), tokenizer: tok.name, exact: tok.exact, results }, null, 2) + "\n");
}
