// `art context`: compact, deterministic context for LLMs instead of whole files.
import type { ComponentDecl, Decl, ModelDecl, Program, ViewNode } from "./ast.ts";
import { show, type Analysis } from "./checker.ts";
import { fmtLoc } from "./errors.ts";
import { viewPaths } from "./patch.ts";
import { printDecl, printElementHead, printExpr, printStmt, printType } from "./printer.ts";

// Rough estimate (≈4 chars per token). NOT a measurement: see benchmarks/ for real numbers.
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

function walk(nodes: ViewNode[], fn: (n: ViewNode) => void) {
  for (const n of nodes) {
    fn(n);
    if (n.kind === "IfView") { walk(n.then, fn); if (n.else) walk(n.else, fn); }
    else if (n.kind === "ForView") walk(n.body, fn);
    else walk(n.children, fn);
  }
}

function uses(c: ComponentDecl): string[] {
  const out = new Set<string>();
  walk(c.view, (n) => { if (n.kind === "Element" && /^[A-Z]/.test(n.tag)) out.add(n.tag); });
  return [...out];
}

function modelDeps(c: ComponentDecl, a: Analysis): string[] {
  const syms = a.symbols.get(c.name);
  const out = new Set<string>();
  for (const s of syms?.values() ?? []) {
    for (const m of a.models.keys()) if (new RegExp(`\\b${m}\\b`).test(show(s.ty))) out.add(m);
  }
  return [...out];
}

// Uses types as declared (ID, Email), not their internal representation.
function modelLine(name: string, p: Program): string {
  const m = p.decls.find((d): d is ModelDecl => d.kind === "Model" && d.name === name)!;
  return `model ${name} { ${m.fields.map((f) => `${f.name}: ${printType(f.type)}`).join(", ")} }`;
}

function symList(c: ComponentDecl, a: Analysis, kind: string): string {
  const syms = a.symbols.get(c.name);
  const items: string[] = [];
  for (const [name, s] of syms ?? []) {
    if (s.kind !== kind) continue;
    if (kind === "fn") {
      const m = c.members.find((x) => x.name === name);
      items.push(`${name}(${m?.kind === "Fn" ? m.params.join(", ") : ""})`);
    } else items.push(`${name}: ${show(s.ty)}`);
  }
  return items.join(", ") || "-";
}

function signature(c: ComponentDecl): string {
  if (c.page) return `page ${c.name} ${JSON.stringify(c.path ?? "/" + c.name.toLowerCase())}`;
  return `component ${c.name}(${c.params.map((p) => `${p.name}: ${p.type.name}${p.type.list ? "[]" : ""}${p.type.optional ? "?" : ""}`).join(", ")})`;
}

// Whole-project map, as short as possible: models in full (their types are needed to write code),
// then one line per file with its declarations and their params. Details: `art context <Name>`.
export function projectMap(p: Program, _a: Analysis, budget = Infinity): string {
  const lines = [`# project: ${p.decls.length} declarations`];
  for (const d of p.decls) {
    if (d.kind === "Model") lines.push(modelLine(d.name, p));
    if (d.kind === "Use") lines.push(printDecl(d));
    if (d.kind === "Api") lines.push(`${printDecl(d)} → /api/${d.name}`);
    if (d.kind === "Auth") lines.push(`auth ${d.api} → auth.signup/login/logout/me`);
  }
  const byFile = new Map<string, string[]>();
  for (const d of p.decls) {
    let entry: string | null = null;
    if (d.kind === "Component") entry = d.page ? `page ${d.name} ${JSON.stringify(d.path ?? "/" + d.name.toLowerCase())}` : d.params.length ? `${d.name}(${d.params.map((x) => x.name).join(", ")})` : d.name;
    if (d.kind === "ServerFn") entry = `server fn ${d.name}(${d.params.join(", ")})`;
    if (entry) byFile.set(d.loc.file, [...(byFile.get(d.loc.file) ?? []), entry]);
  }
  for (const [file, entries] of byFile) lines.push(`${file}: ${entries.join(", ")}`);
  return fit(lines, budget);
}

// Context for one declaration: what's needed to change it without reading the rest.
export function declContext(p: Program, a: Analysis, target: string, budget = Infinity): string | null {
  return declContexts(p, a, [target], budget);
}

// Context for several declarations at once (`art context A B C`): the models they use, once, then
// each one's header (what the source doesn't say: file and who uses it) and its source.
export function declContexts(p: Program, a: Analysis, targets: string[], budget = Infinity): string | null {
  const decls = targets.map((t) => p.decls.find((x) => x.name === t.split("/").pop()));
  if (!decls.length || decls.some((d) => !d)) return null;
  const usedBy = (name: string) => p.decls.filter((x): x is ComponentDecl => x.kind === "Component" && uses(x).includes(name)).map((x) => x.name);
  const models = new Set<string>();
  const blocks: string[][] = [];
  for (const d of decls as Decl[]) {
    if (d.kind === "Model") { models.add(d.name); blocks.push([`model ${d.name} — ${d.loc.file}, used by ${p.decls.filter((x): x is ComponentDecl => x.kind === "Component" && modelDeps(x, a).includes(d.name)).map((x) => x.name).join(", ") || "-"}`]); continue; }
    if (d.kind === "Api") { models.add(d.model); blocks.push([`${printDecl(d)} → /api/${d.name} (list, count, get, create, update, remove) — ${d.loc.file}`]); continue; }
    if (d.kind === "Auth") { blocks.push([`auth ${d.api} → auth.signup(obj), auth.login(email, password), auth.logout(), auth.me() — ${d.loc.file}`]); continue; }
    if (d.kind === "ServerFn") { blocks.push([`server fn ${d.name} → server.${d.name}(${d.params.join(", ")}) — ${d.loc.file}`, printDecl(d)]); continue; }
    if (d.kind === "Use") { blocks.push([`${printDecl(d)} — ${d.loc.file}`]); continue; }
    if (d.kind === "Test") { blocks.push([printDecl(d)]); continue; }
    if (d.kind === "Shared") { blocks.push([`shared by every component — ${d.loc.file}`, printDecl(d)]); continue; }
    for (const m of modelDeps(d, a)) models.add(m);
    const by = usedBy(d.name);
    // The source starts with the signature, so the header only adds where it lives and who uses it.
    blocks.push([`# ${d.loc.file}${by.length ? ` · used by ${by.join(", ")}` : ""}`, printDecl(d)]);
  }
  const head = [...models].map((m) => modelLine(m, p));
  const full = [...head, ...blocks.map((b) => b.join("\n"))].join("\n\n");
  if (estimateTokens(full) <= budget || decls.length > 1) return full;

  // One component and no room for its source: a summary plus the paths `art patch` uses.
  const d = decls[0] as ComponentDecl;
  const summary: string[] = [`${signature(d)} ${blocks[0][0]}`, ...head];
  if (!d.page) summary.push(`props: ${symList(d, a, "prop")}`);
  summary.push(`state: ${symList(d, a, "state")}`, `data: ${symList(d, a, "data")}`, `computed: ${symList(d, a, "computed")}`, `fn: ${symList(d, a, "fn")}`);
  const events: string[] = [];
  walk(d.view, (n) => {
    if (n.kind === "Element" && n.action) events.push(`  ${n.tag}${n.content ? " " + printExpr(n.content) : ""} -> ${n.action.map(printStmt).join("; ")}`);
  });
  if (events.length) summary.push("events:", ...events);
  const paths = ["paths:"];
  for (const { path, node } of viewPaths(d)) {
    const h = node.kind === "Element" ? printElementHead(node) : node.kind === "IfView" ? `if ${printExpr(node.cond)}` : `for ${node.item} in ${printExpr(node.list)}`;
    paths.push(`  ${path}  ${h}`);
  }
  return fit([...summary, ...paths], budget);
}

function fit(lines: string[], budget: number): string {
  const out: string[] = [];
  for (const l of lines) {
    if (estimateTokens([...out, l].join("\n")) > budget) {
      out.push(`… (${lines.length - out.length} lines left out by --budget)`);
      break;
    }
    out.push(l);
  }
  return out.join("\n");
}
