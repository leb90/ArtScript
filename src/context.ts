// `art context`: compact, deterministic context for LLMs instead of whole files.
import type { ComponentDecl, ModelDecl, Program, ViewNode } from "./ast.ts";
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

// Whole-project map: one line per declaration.
export function projectMap(p: Program, a: Analysis, budget = Infinity): string {
  const lines = [`# project: ${p.decls.length} decls`];
  for (const d of p.decls) {
    if (d.kind === "Model") lines.push(modelLine(d.name, p));
    if (d.kind === "Api") lines.push(`${printDecl(d)} → /api/${d.name}`);
    if (d.kind === "Auth") lines.push(`auth ${d.api} → auth.signup/login/logout/me`);
    if (d.kind === "ServerFn") lines.push(`server fn ${d.name}(${d.params.join(", ")}) → server.${d.name}() @${fmtLoc(d.loc)}`);
  }
  for (const d of p.decls) {
    if (d.kind !== "Component") continue;
    let l = signature(d);
    const st = symList(d, a, "state"), cp = symList(d, a, "computed"), fn = symList(d, a, "fn"), us = uses(d);
    if (st !== "-") l += ` state[${st}]`;
    if (cp !== "-") l += ` computed[${cp}]`;
    if (fn !== "-") l += ` fn[${fn}]`;
    if (us.length) l += ` uses[${us.join(", ")}]`;
    l += ` @${fmtLoc(d.loc)}`;
    lines.push(l);
  }
  return fit(lines, budget);
}

// Context for a single declaration: what's needed to change it without reading the rest.
export function declContext(p: Program, a: Analysis, target: string, budget = Infinity): string | null {
  const name = target.split("/").pop()!;
  const d = p.decls.find((x) => x.name === name);
  if (!d) return null;
  const usedBy = p.decls.filter((x): x is ComponentDecl => x.kind === "Component" && uses(x).includes(name)).map((x) => x.name);

  if (d.kind === "Api") {
    const refs = p.decls.filter((x): x is ComponentDecl => x.kind === "Component" && printDecl(x).includes(`api.${name}.`)).map((x) => x.name);
    return fit([`${printDecl(d)} → /api/${name} (list, get, create, update, remove) @${fmtLoc(d.loc)}`, modelLine(d.model, p), `used_by: ${refs.join(", ") || "-"}`], budget);
  }
  if (d.kind === "Auth") return fit([`auth ${d.api} → auth.signup(obj), auth.login(email, password), auth.logout(), auth.me() @${fmtLoc(d.loc)}`], budget);
  if (d.kind === "ServerFn") return fit([`server fn ${name} → server.${name}(${d.params.join(", ")}) @${fmtLoc(d.loc)}`, "source:", printDecl(d)], budget);

  if (d.kind === "Model") {
    const refs = p.decls.filter((x): x is ComponentDecl => x.kind === "Component" && modelDeps(x, a).includes(name)).map((x) => x.name);
    return fit([`${modelLine(name, p)} @${fmtLoc(d.loc)}`, `used_by: ${refs.join(", ") || "-"}`], budget);
  }

  // What the source doesn't say: where it lives, what it uses, who uses it, the models it touches.
  const head = [`${signature(d)} @${fmtLoc(d.loc)}`, `uses: ${uses(d).join(", ") || "-"}`, `used_by: ${usedBy.join(", ") || "-"}`];
  for (const m of modelDeps(d, a)) head.push(modelLine(m, p));
  // With the source nothing else is needed: members, events and patch paths can all be read from it.
  const source = printDecl(d);
  if (estimateTokens(head.join("\n") + "\n" + source) <= budget) return [...head, source].join("\n");

  // No room for the source: a summary plus the paths `art patch` uses.
  const summary: string[] = [];
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
  return fit([...head, ...summary, ...paths], budget);
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
