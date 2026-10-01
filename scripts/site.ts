// Builds the documentation site and playground into site/ (static files, e.g. for GitHub Pages):
//   npm run site
// - index.html: what ArtScript is, with links; spec.html and edit.html: the two specs.
// - playground.html: the compiler running in the browser (site/compiler.js) and the app beside it.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site");
mkdirSync(OUT, { recursive: true });

// ---------- the compiler for the browser ----------
// modules.ts imports node:module (to find esbuild) and node:path: small stand-ins; without esbuild,
// `use` imports just aren't verified.
const shims: esbuild.Plugin = {
  name: "node-shims",
  setup(b) {
    b.onResolve({ filter: /^node:(module|path)$/ }, (a) => ({ path: a.path, namespace: "shim" }));
    b.onLoad({ filter: /.*/, namespace: "shim" }, (a) => ({
      contents: a.path === "node:module"
        ? "export const createRequire = () => () => { throw new Error('no require in the browser'); };"
        : "export const isAbsolute = (p) => p.startsWith('/'); export const dirname = (p) => p.replace(/\\/[^/]*$/, '') || '/'; export const resolve = (...ps) => ps.join('/');",
      loader: "js",
    }));
  },
};
await esbuild.build({
  entryPoints: [join(ROOT, "src", "compile.ts")], bundle: true, format: "esm", platform: "browser", minify: true,
  outfile: join(OUT, "compiler.js"), plugins: [shims], logLevel: "warning",
});
copyFileSync(join(ROOT, "runtime", "runtime.js"), join(OUT, "runtime.js"));

// ---------- a small Markdown renderer for the docs ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s)
  .replace(/``\s?(.+?)\s?``|`([^`]+)`/g, (_, a, b) => `<code>${a ?? b}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u.replace(/^docs\//, "").replace(/SPEC-EDIT\.md$/, "edit.html").replace(/SPEC\.md$/, "spec.html")}">${t}</a>`);
function markdown(md: string): string {
  const out: string[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = /^(\s*)```(\w*)/.exec(l);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i].slice(fence[1].length));
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
    } else if (/^#{1,3} /.test(l)) {
      const n = l.indexOf(" ");
      out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (/^\|/.test(l)) {
      const rows: string[] = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(lines[i]);
      i--;
      const cells = (r: string) => r.slice(1, -1).split("|").map((c) => c.trim());
      out.push(`<table><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>${rows.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table>`);
    } else if (/^\s*- /.test(l)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*- /.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\s*- /, ""))}</li>`);
      i--;
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (l.trim() && !/^>/.test(l)) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join("\n");
}

const CSS = `:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#e5e5e5;--code:#f5f5f5;--accent:#2563eb}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--muted:#999;--line:#333;--code:#1c1c1c;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;gap:20px;align-items:center;padding:14px 24px;border-bottom:1px solid var(--line)}header b{font-size:18px}
header a{color:var(--fg);text-decoration:none}header a:hover{color:var(--accent)}
main{max-width:860px;margin:0 auto;padding:16px 24px 64px}a{color:var(--accent)}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow:auto;font-size:14px}code{font:13.5px ui-monospace,Menlo,monospace}
p code,li code,td code{background:var(--code);padding:1px 5px;border-radius:4px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
h1{font-size:30px}h2{margin-top:36px;border-bottom:1px solid var(--line);padding-bottom:4px}`;
const page = (title: string, body: string, extra = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="ArtScript: a web language for AI that costs less to build and change apps."><style>${CSS}${extra}</style></head><body><header><b>ArtScript</b><a href="index.html">Home</a><a href="spec.html">Spec</a><a href="edit.html">Edit spec</a><a href="playground.html">Playground</a><a href="https://github.com/leb90/ArtScript">GitHub</a></header>${body}</body></html>\n`;

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const intro = readme.split("\n## ")[0];
writeFileSync(join(OUT, "index.html"), page("ArtScript", `<main>${markdown(intro)}<p><a href="spec.html">Read the spec</a> · <a href="playground.html">Try it in the playground</a> · <a href="https://github.com/leb90/ArtScript#cost-eval-results">Measured cost vs React, Svelte, Vue and SolidJS</a></p></main>`));
writeFileSync(join(OUT, "spec.html"), page("ArtScript spec", `<main>${markdown(readFileSync(join(ROOT, "docs", "SPEC.md"), "utf8"))}</main>`));
writeFileSync(join(OUT, "edit.html"), page("ArtScript edit spec", `<main>${markdown(readFileSync(join(ROOT, "docs", "SPEC-EDIT.md"), "utf8"))}</main>`));

// ---------- playground ----------
const examples = Object.fromEntries(["counter", "todo"].map((n) => [n, readFileSync(join(ROOT, "examples", n, "app.art"), "utf8").replace(/\ntest "[\s\S]*$/, "\n")]));
const PG_CSS = `.pg{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 55px)}@media(max-width:800px){.pg{grid-template-columns:1fr;height:auto}}
.pg textarea{width:100%;height:100%;min-height:360px;border:0;border-right:1px solid var(--line);padding:16px;font:14px/1.5 ui-monospace,Menlo,monospace;background:var(--code);color:var(--fg);resize:none;tab-size:2}
.side{display:flex;flex-direction:column;min-height:360px}.bar{display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);align-items:center}
.bar button,.bar select{font:inherit;padding:4px 12px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
#errors{margin:0;padding:12px;color:#dc2626;white-space:pre-wrap;font:13px ui-monospace,monospace}iframe{flex:1;border:0;background:#fafafa}`;
writeFileSync(join(OUT, "playground.html"), page("ArtScript playground", `<div class="pg"><textarea id="src" spellcheck="false"></textarea><div class="side"><div class="bar"><button id="run">Run</button><select id="ex">${Object.keys(examples).map((n) => `<option>${n}</option>`).join("")}</select><span style="color:var(--muted);font-size:13px">Client-side apps; apis need Node (<code>art dev</code>).</span></div><pre id="errors"></pre><iframe id="out" title="app"></iframe></div></div>
<script type="module">
import { compile } from "./compiler.js";
const examples = ${JSON.stringify(examples)};
const src = document.getElementById("src"), errors = document.getElementById("errors"), out = document.getElementById("out");
const runtime = URL.createObjectURL(new Blob([await (await fetch("runtime.js")).text()], { type: "text/javascript" }));
function run() {
  const r = compile([{ file: "app.art", src: src.value }]);
  errors.textContent = r.diagnostics.map((d) => \`line \${d.loc.line}:\${d.loc.col} \${d.type}: \${d.msg}\${d.fixes?.length ? "\\n  fix: " + d.fixes.join(" | ") : ""}\`).join("\\n");
  if (!r.js) return;
  const app = URL.createObjectURL(new Blob([r.js.replace('"./runtime.js"', JSON.stringify(runtime))], { type: "text/javascript" }));
  out.srcdoc = \`<!doctype html><div id="app"></div><script type="module">import { start } from "\${app}"; start(document.getElementById("app"));<\\/script>\`;
}
document.getElementById("ex").onchange = (e) => { src.value = examples[e.target.value]; run(); };
document.getElementById("run").onclick = run;
src.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); });
src.value = examples.counter;
run();
</script>`, PG_CSS));
console.log(`site → ${OUT}`);
