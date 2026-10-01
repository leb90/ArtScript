// Per-stack validators: return the list of errors (empty = the code compiles/typechecks).
// ArtScript: full compiler with types. React: strict tsc. Svelte: the Svelte compiler
// (no TS type checking: more lenient than the other two, which favors Svelte).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../../src/compile.ts";
import { formatAI } from "../../src/errors.ts";

export type Stack = "artscript" | "react" | "svelte";
export type Files = Record<string, string>;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
// Inside the repo, so tsc finds @types/react in node_modules.
const WORK = join(HERE, ".work");

export async function validate(stack: Stack, files: Files): Promise<string[]> {
  const names = Object.keys(files);
  if (!names.length) return ["no se encontraron archivos en la respuesta"];
  if (stack === "artscript") return validateArt(files);
  if (stack === "react") return validateReact(files);
  return validateSvelte(files);
}

function validateArt(files: Files): string[] {
  const src = Object.entries(files).filter(([n]) => n.endsWith(".art")).map(([file, src]) => ({ file, src }));
  if (!src.length) return ["no hay archivos .art"];
  return compile(src).diagnostics.map(formatAI);
}

let seq = 0;
// Typechecks .ts/.tsx with strict tsc; a server.ts gets Node's types.
function validateReact(files: Files): string[] {
  const tsx = Object.keys(files).filter((n) => /\.tsx?$/.test(n));
  return tsc(files, tsx);
}

function tsc(files: Files, include: string[]): string[] {
  const tsx = include;
  if (!tsx.length) return ["no hay archivos .tsx"];
  const dir = join(WORK, `react-${process.pid}-${seq++}`);
  mkdirSync(dir, { recursive: true });
  try {
    for (const [n, s] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, n)), { recursive: true });
      writeFileSync(join(dir, n), s);
    }
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx", strict: true, noEmit: true, skipLibCheck: true, target: "es2022",
        module: "esnext", moduleResolution: "bundler", lib: ["es2022", "dom", "dom.iterable"], types: tsx.includes("server.ts") ? ["node"] : [],
        typeRoots: [join(REPO, "node_modules", "@types")],
      },
      include: tsx,
    }));
    execFileSync(join(REPO, "node_modules", ".bin", "tsc"), ["-p", dir], { cwd: dir, stdio: "pipe" });
    return [];
  } catch (e: any) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const lines = out.split("\n").filter((l) => /error TS\d+/.test(l)).map((l) => l.replace(dir + "/", ""));
    return lines.length ? lines : [out.trim() || String(e)];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function validateSvelte(files: Files): Promise<string[]> {
  const svelte = Object.keys(files).filter((n) => n.endsWith(".svelte"));
  if (!svelte.length) return ["no hay archivos .svelte"];
  const { compile: compileSvelte } = await import("svelte/compiler");
  const errs: string[] = files["server.ts"] ? tsc(files, ["server.ts"]) : [];
  for (const n of svelte) {
    try {
      compileSvelte(files[n], { filename: n, generate: "client" });
    } catch (e: any) {
      errs.push(`${n}${e.start ? `:${e.start.line}:${e.start.column}` : ""} ${e.code ?? "error"}: ${e.message}`);
    }
  }
  return errs;
}

// Extracts files from ```<name.ext> ... ``` blocks.
export function extractFiles(text: string): Files {
  const out: Files = {};
  for (const m of text.matchAll(/```([\w./-]+\.(?:art|tsx|ts|svelte))[^\n]*\n([\s\S]*?)```/g)) out[m[1]] = m[2];
  return out;
}

// Extracts an `art patch` from a ```patch block.
export function extractPatch(text: string): string | null {
  return /```patch\n([\s\S]*?)```/.exec(text)?.[1] ?? null;
}

// Applies search/replace edit blocks (the way agents edit React/Svelte files):
//   ```edit App.tsx
//   <<<<<<< SEARCH
//   old text (must appear exactly once)
//   =======
//   new text
//   >>>>>>> REPLACE
//   ```
export function applyEdits(base: Files, text: string): { files: Files } | { errors: string[] } {
  const files = { ...base };
  const errors: string[] = [];
  for (const block of text.matchAll(/```edit ([\w./-]+)\n([\s\S]*?)```/g)) {
    const name = block[1];
    if (!(name in files)) { errors.push(`edit: no existe el archivo ${name}; archivos: ${Object.keys(files).join(", ")}`); continue; }
    for (const pair of block[2].matchAll(/<<<<<<< SEARCH\n([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g)) {
      const [, search, replace] = pair;
      const count = files[name].split(search).length - 1;
      if (count !== 1) { errors.push(`edit ${name}: el texto SEARCH aparece ${count} veces (debe aparecer exactamente una):\n${search}`); continue; }
      files[name] = files[name].replace(search, () => replace);
    }
  }
  return errors.length ? { errors } : { files };
}
