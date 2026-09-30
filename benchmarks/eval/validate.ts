// Validadores por stack: devuelven la lista de errores (vacía = el código compila/tipa).
// ArtScript: compilador completo con tipos. React: tsc estricto. Svelte: compilador de Svelte
// (sin chequeo de tipos TS: es más permisivo que los otros dos, lo que favorece a Svelte).
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
// Dentro del repo, para que tsc encuentre @types/react en node_modules.
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
function validateReact(files: Files): string[] {
  const tsx = Object.keys(files).filter((n) => /\.tsx?$/.test(n));
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
        module: "esnext", moduleResolution: "bundler", lib: ["es2022", "dom", "dom.iterable"], types: [],
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
  const errs: string[] = [];
  for (const n of svelte) {
    try {
      compileSvelte(files[n], { filename: n, generate: "client" });
    } catch (e: any) {
      errs.push(`${n}${e.start ? `:${e.start.line}:${e.start.column}` : ""} ${e.code ?? "error"}: ${e.message}`);
    }
  }
  return errs;
}

// Extrae archivos de bloques ```<nombre.ext> ... ```.
export function extractFiles(text: string): Files {
  const out: Files = {};
  for (const m of text.matchAll(/```([\w./-]+\.(?:art|tsx|ts|svelte))[^\n]*\n([\s\S]*?)```/g)) out[m[1]] = m[2];
  return out;
}
