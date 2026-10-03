#!/usr/bin/env node
// ArtScript CLI: `art <command>`. Short output; machine-readable with --ai.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { analyze } from "./checker.ts";
import { compile, parseProject, type Source } from "./compile.ts";
import { htmlShell, serverEntry, type ServerSchema } from "./codegen.ts";
import { declContexts, projectMap } from "./context.ts";
import { formatAI, formatHuman, type Diagnostic } from "./errors.ts";
import { parse } from "./parser.ts";
import { applyPatch } from "./patch.ts";
import { printProgram } from "./printer.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(ROOT, "runtime", "runtime.js");
const DEVTOOLS = join(ROOT, "runtime", "devtools.js");
const DEMO = join(ROOT, "runtime", "demo.js");
const SERVER_RUNTIME = join(ROOT, "runtime", "server.js");
const SSR_RUNTIME = join(ROOT, "runtime", "ssr.js");
// dist/Dockerfile for apps with a server: Node only (server.js is self-contained), data on a volume.
const DOCKERFILE = `FROM node:24-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=3000 ART_DATA_DIR=/data
VOLUME /data
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/_health || exit 1
CMD ["node", "server.js"]
`;
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const HELP = `art ${PKG.version} — the ArtScript compiler

  art init <name> [--template t]                   create a new project
  art dev [path] [--port 3000]      dev server with live reload and dev tools (Alt+A in the page)
  art build [path] [--out dist] [--sourcemap] [--base /sub] [--prerender [--site url]] [--demo]
                                    build for production (prerender: HTML per route; site: sitemap.xml)
  art check [path] [--ai]           typecheck; --ai = one JSON line per error
  art fmt [path] [--write]          canonical format (without --write it only prints)
  art patch [file|-] [--dir path] [--dry-run] [--ai]
                                    apply structured edits (reads stdin without a file)
  art add <Component...>            add official components as source: DataTable, Pagination,
                                    ConfirmButton, SearchBox, Stat, EmptyState
  art test [path]                   run the project's test "..." { } blocks (needs happy-dom)
  art lsp                           language server (stdio): live errors, formatting, completion
  art mcp [--dir path]               MCP server (stdio) with art_spec, art_check, art_context, art_patch
  art context [Name...] [--dir path] [--budget N]
                                    compact context for AI (without a name: project map)
  art ast <file>                    AST as JSON
  art bench                         benchmarks (only inside the ArtScript repo)

  [path] defaults to ./src if it exists, otherwise the current directory.
`;

// ---------- arguments ----------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = new Map<string, string | true>();
const pos: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--") && ["--out", "--port", "--dir", "--budget", "--template", "--site", "--base"].includes(a)) { flags.set(a, next); i++; }
    else flags.set(a, true);
  } else pos.push(a);
}
const flag = (name: string) => flags.get(name);

// ---------- utilities ----------
function findFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findFiles(p, ext));
    else if (extname(e.name) === ext) out.push(p);
  }
  return out.sort();
}

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

// Project convention: code lives in ./src; if missing, in the current directory.
const defaultTarget = () => (existsSync("src") && statSync("src").isDirectory() ? "src" : ".");
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
// Project root: the parent of `src/`, or the given directory.
function projectRoot(target: string): string {
  const dir = isDir(target) ? target : dirname(target);
  return basename(resolve(dir)) === "src" ? dirname(dir) : dir;
}

function sources(target: string): Source[] {
  if (!existsSync(target)) die(`not found: ${target}`);
  const files = isDir(target) ? findArt(target) : [target];
  if (!files.length) die(`no .art files in ${target}`);
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
  const w = Math.max(12, ...rows.map((r) => r[0].length));
  const line = (n: string, r: number, g: number, br: number) => `  ${n.padEnd(w)} ${kb(r).padStart(10)} ${kb(g).padStart(10)} ${kb(br).padStart(10)}`;
  const header = `  ${"file".padEnd(w)} ${"raw".padStart(10)} ${"gzip".padStart(10)} ${"brotli".padStart(10)}`;
  return [header, ...rows.map((r) => line(...r)), line("total", ...total)].join("\n");
}

// Compiles in memory: { "index.html", "app.js" } or the diagnostics. app.js is one bundle with the
// runtime and every `use` module (npm packages resolve from the project's node_modules).
// With apis, `server` is the schema for the server runtime.
// `dev` (art dev): the bundle includes the dev tools panel.
let shellHead = ""; // <head> tags every page of the project gets (the favicon)
// `demo` (art build --demo): the api, accounts and server fns are bundled in and run in the browser
// (runtime/demo.js), so a full-stack app is published as static files.
async function buildFiles(target: string, minify: boolean, maps: "inline" | "linked" | false = minify ? false : "inline", base = "/", dev = false, demo = false): Promise<{ files: Record<string, string>; server: ServerSchema | null } | { diagnostics: Diagnostic[] }> {
  const r = compile(sources(target), { dev });
  if (!r.js) return { diagnostics: r.diagnostics };
  const esbuild = await import("esbuild");
  let demoEntry = "", demoFile = "";
  if (demo && r.server) {
    // Next to the project, so the `use` imports of server fns resolve as they do in `art dev`.
    const { fns, ...schema } = r.server;
    demoFile = resolve(projectRoot(target), ".art", `demo-fns-${Date.now()}.mjs`);
    mkdirSync(dirname(demoFile), { recursive: true });
    writeFileSync(demoFile, fns);
    demoEntry = `import { installDemo as $installDemo } from ${JSON.stringify(DEMO)};\nimport { fns as $demoFns, jobs as $demoJobs } from ${JSON.stringify(demoFile)};\n$installDemo(${JSON.stringify(schema)}, $demoFns, $demoJobs, ${JSON.stringify(base.replace(/\/+$/, ""))});\n`;
    r.server = null;
  }
  try {
    const out = await esbuild.build({
      // The bundle starts the app itself, so index.html has no inline script (a strict CSP works).
      // The .art source map goes in as an input map, so esbuild's map points back to the .art files.
      stdin: { contents: demoEntry + r.js.replace('"./runtime.js"', JSON.stringify(RUNTIME)).replace('"./devtools.js"', JSON.stringify(DEVTOOLS)) + `\nif (!globalThis.__artSSR) start(undefined, ${JSON.stringify(base)});\n` + (maps && r.map ? `//# sourceMappingURL=data:application/json;base64,${Buffer.from(r.map).toString("base64")}\n` : ""), resolveDir: resolve(projectRoot(target)), loader: "js", sourcefile: "app.art.js" },
      // `import()` in a `use` module becomes its own chunk, loaded only when it runs.
      bundle: true, format: "esm", platform: "browser", write: false, minify, logLevel: "silent", sourcemap: maps || false,
      splitting: true, outdir: "/out", entryNames: "app", chunkNames: "chunks/[name]-[hash]",
      define: { "process.env.NODE_ENV": minify ? '"production"' : '"development"' },
    });
    // Every .css file of the project (outside dist/public) becomes app.css, loaded after the
    // runtime's styles so it can override them (and the --a-* theme variables).
    const root = projectRoot(target);
    const cssFiles = findFiles(root, ".css").filter((f) => !relative(root, f).startsWith("public"));
    const css = cssFiles.map((f) => `/* ${relative(root, f)} */\n${readFileSync(f, "utf8")}`).join("\n");
    // A favicon in public/ is linked from every page.
    const icon = ["favicon.svg", "favicon.png", "favicon.ico"].find((f) => existsSync(join(root, "public", f)));
    shellHead = (icon ? `<link rel="icon" href="${base}${icon}">` : "") + (existsSync(join(root, "public", "apple-touch-icon.png")) ? `<link rel="apple-touch-icon" href="${base}apple-touch-icon.png">` : "");
    const files: Record<string, string> = { "index.html": htmlShell("ArtScript", shellHead, "", !!css, base) };
    for (const f of out.outputFiles) files[relative("/out", f.path)] = f.text;
    if (css) files["app.css"] = css;
    if (demoFile) rmSync(demoFile, { force: true });
    return { files, server: r.server };
  } catch (e: any) {
    if (demoFile) rmSync(demoFile, { force: true });
    const loc = { file: target, line: 1, col: 1 };
    return { diagnostics: (e.errors ?? [{ text: String(e) }]).map((x: any) => ({ code: "E1050", type: "UNKNOWN_MODULE", msg: x.text, loc })) };
  }
}

// ---------- commands ----------
switch (cmd) {
  case "init": {
    const name = pos[0];
    if (!name) die("usage: art init <name>");
    if (existsSync(name) && readdirSync(name).length) die(`'${name}' already exists and isn't empty`);
    const tpl = join(ROOT, "templates", "default");
    cpSync(tpl, name, { recursive: true });
    // npm doesn't publish files named .gitignore, so the template stores it as `gitignore`.
    renameSync(join(name, "gitignore"), join(name, ".gitignore"));
    cpSync(join(ROOT, "docs", "SPEC.md"), join(name, "ARTSCRIPT.md"));
    cpSync(join(ROOT, "docs", "SPEC-EDIT.md"), join(name, "ARTSCRIPT-EDIT.md"));
    // --template blog|notes|catalog|todo|users: start from a working app instead of the blank page.
    const template = flag("--template") as string | undefined;
    if (template) {
      const starter = join(ROOT, "templates", "starters", `${template}.art`);
      if (!existsSync(starter)) die(`unknown template '${template}'. Available: ${readdirSync(join(ROOT, "templates", "starters")).map((f) => f.replace(".art", "")).join(", ")}`);
      cpSync(starter, join(name, "src", "app.art"));
    }
    // Until it's published on npm, the project uses this local copy of ArtScript.
    const local = !ROOT.split(/[\\/]/).includes("node_modules");
    const pkgPath = join(name, "package.json");
    const pkg = readFileSync(pkgPath, "utf8")
      .replace("__NAME__", basename(resolve(name)).toLowerCase().replace(/[^a-z0-9-]/g, "-"))
      .replace("__ARTSCRIPT__", local ? `file:${ROOT}` : `^${PKG.version}`);
    writeFileSync(pkgPath, pkg);
    console.log(`project created in ${name}/\n\n  cd ${name}\n  npm install\n  npm run dev\n`);
    break;
  }

  case "build": {
    const target = pos[0] ?? defaultTarget();
    const outDir = (flag("--out") as string) ?? join(projectRoot(target), "dist");
    // --base /sub: the app is served under that path (GitHub Pages project sites, a proxy prefix).
    const base = `/${((flag("--base") as string | undefined) ?? "").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
    const demo = flags.has("--demo");
    const r = await buildFiles(target, true, flags.has("--sourcemap") ? "linked" : false, base, false, demo);
    if ("diagnostics" in r) { report(r.diagnostics, false); process.exit(1); }
    mkdirSync(outDir, { recursive: true });
    for (const [f, s] of Object.entries(r.files)) {
      mkdirSync(dirname(join(outDir, f)), { recursive: true });
      writeFileSync(join(outDir, f), s);
    }
    // --prerender: an HTML file per static route with its content (visible without JS, indexable).
    if (flags.has("--prerender")) {
      const { prerender } = await import(pathToFileURL(SSR_RUNTIME).href);
      const program = parseProject(sources(target)).program;
      const paths = program.decls.flatMap((d) => (d.kind === "Component" && d.page && !/[:*]/.test(d.path ?? "") ? [d.path ?? "/" + d.name.toLowerCase()] : []));
      // Routes that aren't prerendered (`/posts/:id`) are served this empty shell, not the home page.
      writeFileSync(join(outDir, "_app.html"), r.files["index.html"]);
      // --site https://example.com: sitemap.xml with those routes, robots.txt pointing to it, and
      // an absolute og:image (crawlers need the full URL).
      const site = (flag("--site") as string | undefined)?.replace(/\/+$/, "");
      const render = async (path: string) => {
        const page = await prerender(pathToFileURL(join(outDir, "app.js")).href, base.slice(0, -1) + path);
        const head = site ? page.head.replace(/(property="og:image" content=")(\/[^"]*)/, `$1${site}$2`) : page.head;
        return htmlShell(page.title || "ArtScript", shellHead + head, page.html, "app.css" in r.files, base);
      };
      for (const path of paths) {
        const file = path === "/" ? join(outDir, "index.html") : join(outDir, path, "index.html");
        mkdirSync(dirname(file), { recursive: true });
        const html = await render(path);
        writeFileSync(file, html);
        r.files[relative(outDir, file)] = html; // the size table shows the pages as they are served
      }
      // 404.html, which static hosts serve for unknown paths: the `"*"` page when there is one
      // (the app then takes over and shows the right page for routes with params).
      writeFileSync(join(outDir, "404.html"), program.decls.some((d) => d.kind === "Component" && d.path === "*") ? await render("/404") : r.files["index.html"]);
      console.log(`prerendered: ${paths.join(" ")}`);
      if (site) {
        const urls = paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join("\n");
        writeFileSync(join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
        writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
        console.log(`sitemap: ${site}/sitemap.xml`);
      }
    }
    const pub = join(projectRoot(target), "public");
    if (isDir(pub)) cpSync(pub, outDir, { recursive: true });
    if (demo) {
      // Static hosts: unknown paths get the app (Netlify reads _redirects, others serve 404.html).
      if (!existsSync(join(outDir, "_redirects"))) writeFileSync(join(outDir, "_redirects"), `${base}* ${base}index.html 200\n`);
      if (!existsSync(join(outDir, "404.html"))) writeFileSync(join(outDir, "404.html"), r.files["index.html"]);
      console.log("demo: the api, accounts and server fns run in the visitor's browser (their data stays there); publish this folder on any static host");
    }
    console.log(`build ok → ${relative(process.cwd(), outDir) || outDir}\n${sizes(r.files)}`);
    if (r.server) {
      // One self-contained file: the server runtime and the npm packages server fns use are bundled
      // in, so dist/ runs anywhere with Node (no node_modules).
      const esbuild = await import("esbuild");
      const entry = serverEntry(r.server).replace('"./server-runtime.js"', JSON.stringify(SERVER_RUNTIME));
      const out = await esbuild.build({
        stdin: { contents: entry, resolveDir: resolve(projectRoot(target)), loader: "js" },
        bundle: true, format: "esm", platform: "node", target: "node24", write: false, logLevel: "silent",
        banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
      });
      writeFileSync(join(outDir, "server.js"), out.outputFiles[0].text);
      writeFileSync(join(outDir, "Dockerfile"), DOCKERFILE);
      writeFileSync(join(outDir, ".dockerignore"), "data\n");
      console.log(`\n  with api: node ${join(relative(process.cwd(), outDir) || outDir, "server.js")}  (data in ./data, or ART_DATA_DIR)\n  docker:   docker build -t app ${relative(process.cwd(), outDir) || outDir} && docker run -p 3000:3000 -v app-data:/data app`);
    }
    break;
  }

  case "check": {
    const ai = flags.has("--ai");
    const src = sources(pos[0] ?? defaultTarget());
    const { program, diagnostics } = parseProject(src);
    const diags = diagnostics.length ? diagnostics : analyze(program).diagnostics;
    report(diags, ai);
    if (!diags.length) console.log(ai ? '{"ok":true}' : `ok: ${src.length} file(s), ${program.decls.length} declarations`);
    process.exit(diags.length ? 1 : 0);
  }

  case "fmt": {
    const write = flags.has("--write");
    let failed = false;
    for (const s of sources(pos[0] ?? defaultTarget())) {
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
      writeFileSync(s.file, out);
      console.log(`formatted ${s.file}`);
    }
    process.exit(failed ? 1 : 0);
  }

  case "ast": {
    if (!pos[0]) die("usage: art ast <file.art>");
    const loc = flags.has("--loc");
    const program = parse(readFileSync(pos[0], "utf8"), pos[0]);
    console.log(JSON.stringify(program, (k, v) => (k === "loc" && !loc ? undefined : v), 1));
    break;
  }

  case "add": {
    // Copies official components (templates/components) into the project, as source to change.
    const dir = join(ROOT, "templates", "components");
    const available = readdirSync(dir).map((f) => f.replace(".art", ""));
    if (!pos.length) die(`usage: art add <Component...>. Available: ${available.join(", ")}`);
    const project = (flag("--dir") as string) ?? ".";
    const dest = isDir(join(project, "src")) ? join(project, "src") : project;
    for (const want of pos) {
      const name = available.find((n) => n.toLowerCase() === want.toLowerCase());
      if (!name) die(`unknown component '${want}'. Available: ${available.join(", ")}`);
      const to = join(dest, `${name}.art`);
      if (existsSync(to)) die(`${to} already exists`);
      cpSync(join(dir, `${name}.art`), to);
      console.log(`added ${relative(process.cwd(), to)}`);
    }
    break;
  }

  case "test": {
    // Runs every `test "..." { }` of the project in a simulated browser (fresh database each).
    const { runTests } = await import("./testing.ts");
    const r = await runTests(sources(pos[0] ?? defaultTarget()));
    if ("diagnostics" in r) { console.log(r.diagnostics.join("\n")); process.exit(1); }
    for (const t of r) console.log(`${t.ok ? "✓" : "✗"} ${t.name.replace(/^test /, "")}${t.ok ? "" : `\n    ${t.error}`}`);
    const failed = r.filter((t) => !t.ok).length;
    console.log(`\n${r.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  case "lsp": {
    const { runLsp } = await import("./lsp.ts");
    runLsp();
    break;
  }

  case "mcp": {
    // An MCP server for agents; the workspace is the current directory (or --dir).
    const { runMcp } = await import("./mcp.ts");
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    runMcp(resolve((flag("--dir") as string) ?? "."), join(ROOT, "docs"), pkg.version);
    break;
  }

  case "patch": {
    const ai = flags.has("--ai");
    const target = (flag("--dir") as string) ?? defaultTarget();
    const text = pos[0] && pos[0] !== "-" ? readFileSync(pos[0], "utf8") : readFileSync(0, "utf8");
    const r = applyPatch(sources(target), text);
    if (r.diagnostics.length) { report(r.diagnostics, ai); process.exit(1); }
    if (flags.has("--dry-run")) {
      for (const f of r.changed) console.log(`--- ${f}\n${r.files[f]}`);
      break;
    }
    // New files from `add file.art` go next to the project's other sources.
    const base = isDir(target) ? target : dirname(target);
    for (const f of r.changed) writeFileSync(existsSync(f) || f.includes("/") ? f : join(base, f), r.files[f]);
    console.log(ai ? JSON.stringify({ ok: true, changed: r.changed }) : r.changed.length ? `ok: updated ${r.changed.join(", ")}` : "ok: no changes");
    break;
  }

  case "context": {
    const { program, diagnostics } = parseProject(sources((flag("--dir") as string) ?? defaultTarget()));
    if (diagnostics.length) { report(diagnostics, true); process.exit(1); }
    const a = analyze(program);
    const budget = flag("--budget") ? Number(flag("--budget")) : Infinity;
    if (!pos[0]) console.log(projectMap(program, a, budget));
    else {
      const out = declContexts(program, a, pos, budget);
      if (out === null) die(`'${pos.find((n) => !program.decls.some((d) => d.name === n.split("/").pop()))}' doesn't exist. Available: ${program.decls.map((d) => d.name).join(", ")}`);
      console.log(out);
    }
    break;
  }

  case "dev": {
    const target = pos[0] ?? defaultTarget();
    const pub = join(projectRoot(target), "public");
    const clients = new Set<ServerResponse>();
    // Live reload + compile error overlay in the browser.
    const client = `<script>(()=>{const s=new EventSource("/__art");s.onmessage=e=>{if(e.data==="reload")return location.reload();let o=document.getElementById("__art_err");if(!o){o=document.createElement("pre");o.id="__art_err";o.style.cssText="position:fixed;inset:0;margin:0;padding:24px;background:#1a0000ee;color:#ffb4b4;font:14px/1.5 monospace;white-space:pre-wrap;z-index:99999";document.body.appendChild(o)}o.textContent=JSON.parse(e.data)}})()</script>`;
    let files: Record<string, string> = {};
    let lastError: string | null = null;
    // Apis run in this same process; dev data lives in <project>/.art/data.
    const { createApi } = await import(pathToFileURL(SERVER_RUNTIME).href);
    const dataDir = join(projectRoot(target), ".art", "data");
    let api: (((req: unknown, res: unknown) => Promise<boolean>) & { stop?: () => void }) | null = null;
    let apiSchema = "";
    const rebuild = async (): Promise<boolean> => {
      const r = await buildFiles(target, false, "inline", "/", true);
      if ("diagnostics" in r) {
        lastError = r.diagnostics.map(formatHuman).join("\n\n");
        console.log(lastError);
        return false;
      }
      files = r.files;
      lastError = null;
      const schema = JSON.stringify(r.server);
      if (schema !== apiSchema) {
        apiSchema = schema;
        // Server fns are written next to the project so their `use` imports resolve like the app's.
        let fns = {}, jobs = {};
        if (r.server) {
          const file = join(projectRoot(target), ".art", `server-fns-${Date.now()}.mjs`);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, r.server.fns);
          ({ fns, jobs } = await import(pathToFileURL(file).href));
          rmSync(file, { force: true });
        }
        try {
          api?.stop?.(); // the previous build's jobs
          api = r.server ? createApi(r.server, dataDir, fns, jobs) : null;
        } catch (e) {
          // A migration that can't run (a new required field without a default): shown like a
          // compile error, retried on the next save.
          api = null;
          apiSchema = "";
          lastError = (e as Error).message;
          console.log(lastError);
          return false;
        }
      }
      return true;
    };
    await rebuild();

    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
    const server = createServer(async (req, res) => {
      if (api && (await api(req, res))) return;
      const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (url === "/__art") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        clients.add(res);
        if (lastError) res.write(`data: ${JSON.stringify(lastError)}\n\n`);
        req.on("close", () => clients.delete(res));
        return;
      }
      const name = url === "/" ? "index.html" : url.slice(1);
      if (name in files) {
        const body = name === "index.html" ? files[name].replace("</body>", client + "</body>") : files[name];
        res.writeHead(200, { "content-type": types[extname(name)] ?? "text/plain", "cache-control": "no-store" }).end(body);
        return;
      }
      // Static files from ./public (images, icons...). Blocks paths outside that folder.
      const base = resolve(pub);
      const file = resolve(base, "." + url);
      if (file.startsWith(base + "/") && existsSync(file) && !statSync(file).isDirectory()) {
        res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
        return;
      }
      // Route paths (no file extension) get the app, so URLs like /products/7 work on reload.
      if (!extname(url) && "index.html" in files) {
        res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end(files["index.html"].replace("</body>", client + "</body>"));
        return;
      }
      res.writeHead(404).end("404");
    });

    // If the port is busy, try the next one (like Vite).
    let port = Number(flag("--port") ?? 3000);
    server.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE" && port < Number(flag("--port") ?? 3000) + 20) server.listen(++port);
      else die(e.message);
    });
    server.on("listening", () => console.log(`\n  ArtScript dev → http://localhost:${port}\n  edit ${target}/ and it reloads · Ctrl+C to quit\n`));
    server.listen(port);

    const watchDir = isDir(target) ? target : dirname(target);
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(watchDir, { recursive: true }, (_e, changed) => {
      if (!changed || !/\.(art|css)$/.test(String(changed)) || String(changed).includes("dist")) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const ok = await rebuild();
        if (ok) console.log(`rebuilt (${String(changed)})`);
        const msg = ok ? "reload" : JSON.stringify(lastError);
        for (const c of clients) c.write(`data: ${msg}\n\n`);
      }, 50);
    });
    break;
  }

  case "bench": {
    const script = join(ROOT, "benchmarks", "measure.ts");
    if (!existsSync(script)) die("art bench is only available inside the ArtScript repo");
    const { runBench } = await import(pathToFileURL(script).href);
    await runBench();
    break;
  }

  case "--version": case "-v": case "version":
    console.log(PKG.version);
    break;

  default:
    console.log(HELP);
    if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1);
}
