#!/usr/bin/env node
// CLI de ArtScript: `art <comando>`. Salida corta; con --ai, machine-readable.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { analyze } from "./checker.ts";
import { compile, parseProject, type Source } from "./compile.ts";
import { htmlShell } from "./codegen.ts";
import { declContext, projectMap } from "./context.ts";
import { formatAI, formatHuman, type Diagnostic } from "./errors.ts";
import { parse } from "./parser.ts";
import { printProgram } from "./printer.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(ROOT, "runtime", "runtime.js");

const HELP = `art — compilador de ArtScript

  art build [ruta] [--out dir]      compila a dist/ (index.html, app.js, runtime.js)
  art dev [ruta] [--port 3000]      servidor de desarrollo con recarga automática
  art check [ruta] [--ai]           verifica tipos; --ai = JSON por línea
  art fmt [ruta] [--write]          formato canónico (sin --write solo muestra)
  art ast <archivo>                 AST en JSON
  art context [Nombre] [--dir ruta] [--budget N]
                                    contexto compacto para IA (sin nombre: mapa del proyecto)
  art bench                         benchmarks de tamaño y tokens (estimados)
`;

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = new Map<string, string | true>();
const pos: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--") && ["--out", "--port", "--dir", "--budget"].includes(a)) { flags.set(a, next); i++; }
    else flags.set(a, true);
  } else pos.push(a);
}
const flag = (name: string) => flags.get(name);

// ---------- utilidades ----------
function findArt(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findArt(p));
    else if (extname(e.name) === ".art") out.push(p);
  }
  return out.sort();
}

function sources(target = "."): Source[] {
  if (!existsSync(target)) die(`no existe: ${target}`);
  const files = statSync(target).isDirectory() ? findArt(target) : [target];
  if (!files.length) die(`no hay archivos .art en ${target}`);
  return files.map((f) => {
    const rel = relative(process.cwd(), f);
    return { file: rel && !rel.startsWith("..") ? rel : f, src: readFileSync(f, "utf8") };
  });
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function report(diags: Diagnostic[], ai: boolean) {
  for (const d of diags) console.log(ai ? formatAI(d) : formatHuman(d));
}

const kb = (n: number) => (n / 1024).toFixed(2) + " KB";

function sizes(files: Record<string, string>): string {
  const rows = Object.entries(files).map(([name, s]) => {
    const b = Buffer.from(s);
    return [name, b.length, gzipSync(b).length, brotliCompressSync(b).length] as const;
  });
  const total = rows.reduce<[number, number, number]>((a, r) => [a[0] + r[1], a[1] + r[2], a[2] + r[3]], [0, 0, 0]);
  const line = (n: string, r: number, g: number, br: number) => `  ${n.padEnd(12)} ${kb(r).padStart(10)} ${kb(g).padStart(10)} ${kb(br).padStart(10)}`;
  const header = `  ${"archivo".padEnd(12)} ${"raw".padStart(10)} ${"gzip".padStart(10)} ${"brotli".padStart(10)}`;
  return [header, ...rows.map((r) => line(...r)), line("total", ...total)].join("\n");
}

function build(target: string, outDir: string, quiet = false): boolean {
  const r = compile(sources(target));
  if (!r.js) {
    report(r.diagnostics, false);
    return false;
  }
  mkdirSync(outDir, { recursive: true });
  const runtime = readFileSync(RUNTIME, "utf8");
  const html = htmlShell();
  writeFileSync(join(outDir, "app.js"), r.js);
  writeFileSync(join(outDir, "runtime.js"), runtime);
  writeFileSync(join(outDir, "index.html"), html);
  if (!quiet) console.log(`build ok → ${relative(process.cwd(), outDir) || outDir}\n${sizes({ "app.js": r.js, "runtime.js": runtime, "index.html": html })}`);
  return true;
}

function defaultOut(target: string): string {
  const base = existsSync(target) && statSync(target).isDirectory() ? target : dirname(target);
  return join(base, "dist");
}

// ---------- comandos ----------
switch (cmd) {
  case "build": {
    const target = pos[0] ?? ".";
    if (!build(target, (flag("--out") as string) ?? defaultOut(target))) process.exit(1);
    break;
  }

  case "check": {
    const ai = flags.has("--ai");
    const src = sources(pos[0] ?? ".");
    const { program, diagnostics } = parseProject(src);
    const diags = diagnostics.length ? diagnostics : analyze(program).diagnostics;
    report(diags, ai);
    if (!diags.length) console.log(ai ? '{"ok":true}' : `ok: ${src.length} archivo(s), ${program.decls.length} declaraciones`);
    process.exit(diags.length ? 1 : 0);
  }

  case "fmt": {
    const write = flags.has("--write");
    let failed = false;
    for (const s of sources(pos[0] ?? ".")) {
      let out: string;
      try {
        out = printProgram(parse(s.src, s.file));
      } catch (e: any) {
        if (!e.diagnostic) throw e;
        report([e.diagnostic], false);
        failed = true;
        continue;
      }
      if (!write) { process.stdout.write(out); continue; }
      if (out === s.src) continue;
      // El AST todavía no conserva comentarios: no reescribir archivos que los tengan.
      if (/\/\/|\/\*/.test(s.src)) { console.error(`omitido ${s.file}: tiene comentarios (fmt aún no los preserva)`); continue; }
      writeFileSync(s.file, out);
      console.log(`formateado ${s.file}`);
    }
    process.exit(failed ? 1 : 0);
  }

  case "ast": {
    if (!pos[0]) die("uso: art ast <archivo.art>");
    const loc = flags.has("--loc");
    const program = parse(readFileSync(pos[0], "utf8"), pos[0]);
    console.log(JSON.stringify(program, (k, v) => (k === "loc" && !loc ? undefined : v), 1));
    break;
  }

  case "context": {
    const { program, diagnostics } = parseProject(sources((flag("--dir") as string) ?? "."));
    if (diagnostics.length) { report(diagnostics, true); process.exit(1); }
    const a = analyze(program);
    const budget = flag("--budget") ? Number(flag("--budget")) : Infinity;
    if (!pos[0]) console.log(projectMap(program, a, budget));
    else {
      const out = declContext(program, a, pos[0], budget);
      if (out === null) die(`no existe '${pos[0]}'. Disponibles: ${program.decls.map((d) => d.name).join(", ")}`);
      console.log(out);
    }
    break;
  }

  case "dev": {
    const target = pos[0] ?? ".";
    const outDir = (flag("--out") as string) ?? defaultOut(target);
    const port = Number(flag("--port") ?? 3000);
    const clients = new Set<ServerResponse>();
    const reload = `<script>new EventSource("/__art").onmessage=()=>location.reload()</script>`;
    build(target, outDir);
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    createServer((req, res) => {
      const url = (req.url ?? "/").split("?")[0];
      if (url === "/__art") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      const base = resolve(outDir);
      const file = resolve(base, "." + decodeURIComponent(url === "/" ? "/index.html" : url));
      if (!file.startsWith(base + "/")) { res.writeHead(403).end(); return; }
      if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end("404"); return; }
      let body: string | Buffer = readFileSync(file);
      if (file.endsWith(".html")) body = body.toString().replace("</body>", reload + "</body>");
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
    }).listen(port, () => console.log(`dev → http://localhost:${port}`));
    const watchDir = existsSync(target) && statSync(target).isDirectory() ? target : dirname(target);
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(watchDir, { recursive: true }, (_e, name) => {
      if (!name || !String(name).endsWith(".art")) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (build(target, outDir, true)) {
          console.log(`recompilado (${String(name)})`);
          for (const c of clients) c.write("data: reload\n\n");
        }
      }, 50);
    });
    break;
  }

  case "bench": {
    const { runBench } = await import("../benchmarks/measure.ts");
    runBench();
    break;
  }

  default:
    console.log(HELP);
    if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1);
}
