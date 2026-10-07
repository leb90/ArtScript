// Generates an ES module that builds the DOM directly (no virtual DOM) using runtime.js.
import type { ApiAccess, ComponentDecl, FieldRules, Element, Expr, Loc, Member, Program, ServerFnDecl, Stmt, ViewNode } from "./ast.ts";
import { specifier } from "./modules.ts";
import { printDecl, printType } from "./printer.ts";
import { BREAKPOINTS, ELEMENTS, ENUM_PROPS, SPACING_PROPS } from "./elements.ts";
import { slotNames, twoWayProps } from "./checker.ts";
import { ICONS } from "./icons.ts";
import { scopeCss } from "./css.ts";

// Props each component assigns (bound two-way), for the program being generated.
let twoWay = new Map<string, Set<string>>();
// The slots each component declares ("" = unnamed).
let slotsOf = new Map<string, Set<string>>();

type Kind = "state" | "data" | "computed" | "prop" | "fn" | "let" | "loop" | "param";
type Sym = { kind: Kind; sig?: string }; // sig: signal to notify on mutation (loops over a state)

class Scope {
  vars = new Map<string, Sym>();
  parent: Scope | null;
  constructor(parent: Scope | null) {
    this.parent = parent;
  }
  get(n: string): Sym | undefined {
    return this.vars.get(n) ?? this.parent?.get(n);
  }
  child(): Scope {
    return new Scope(this);
  }
}

// In-place mutating methods: after calling them, the owning state must be notified.
// Array methods whose callback receives the array's own items first.
const ITERATORS = new Set(["forEach", "map", "filter", "find", "findLast", "findIndex", "some", "every", "flatMap"]);
const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "delete", "add", "clear"]);
const ALIGN: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", stretch: "stretch", between: "space-between", around: "space-around" };
const JS_OPS: Record<string, string> = { "==": "===", "!=": "!==" };

// `use` declarations as ES imports; only those whose names appear in `onlyFor` when given.
function importLines(program: Program, onlyFor?: string): string[] {
  const out: string[] = [];
  // Several files may `use` the same names: each is imported once (they're global to the project).
  const seen = new Set<string>();
  for (const d of program.decls) {
    if (d.kind !== "Use") continue;
    const used = (n: string) => !seen.has(n) && (onlyFor === undefined || new RegExp(`\\b${n}\\b`).test(onlyFor));
    const def = d.default && used(d.default) ? d.default : null;
    const names = d.names.filter(used);
    for (const n of [def, ...names]) if (n) seen.add(n);
    if (!def && !names.length) continue;
    const what = [def, names.length ? `{ ${names.map((n) => (d.renames?.[n] ? `${d.renames[n]} as ${n}` : n)).join(", ")} }` : null].filter(Boolean).join(", ");
    out.push(`import ${what} from ${JSON.stringify(specifier(d.source, d.loc.file))};`);
  }
  return out;
}

// A page's layouts, outermost first. Without an explicit one, a page uses the only top-level layout
// (one that isn't inside another), if there is exactly one.
function layoutChain(program: Program, name: string | null | undefined): string[] {
  const layouts = program.decls.filter((x): x is ComponentDecl => x.kind === "Component" && !!x.layout);
  const roots = layouts.filter((l) => !l.layoutName);
  const chain: string[] = [];
  for (let n = name ?? (roots.length === 1 ? roots[0].name : null); n && !chain.includes(n); n = layouts.find((l) => l.name === n)?.layoutName ?? null) chain.unshift(n);
  return chain;
}

export function generate(program: Program): string {
  return generateMapped(program).js;
}

// The JS and, per JS line, the .art location it comes from (undefined for glue code).
export function generateMapped(program: Program, dev = false): { js: string; marks: (Loc | undefined)[] } {
  const marks: (Loc | undefined)[] = [];
  devMode = dev;
  const out: string[] = ['import * as $ from "./runtime.js";', ...(dev ? ['import { $inspect } from "./devtools.js";'] : []), ...importLines(program), "const navigate = $.navigate, notify = $.notify, setTheme = $.setTheme, theme = $.theme;", ""];
  const apis = program.decls.filter((d) => d.kind === "Api");
  // Typed REST client: one entry per `api` declaration.
  if (apis.length) out.push(`const api = { ${apis.map((a) => `${a.name}: $.$api(${JSON.stringify(a.name)})`).join(", ")} };`, "");
  if (program.decls.some((d) => d.kind === "Auth")) out.push("const auth = $.$auth();", "");
  if (program.decls.some((d) => d.kind === "ServerFn")) out.push("const server = $.$server();", "");
  sharedScope = new Scope(null);
  const shared = program.decls.filter((d) => d.kind === "Shared");
  if (shared.length) {
    const g = new ComponentGen({ kind: "Component", page: false, name: "(shared)", path: null, params: [], members: [], view: [], loc: shared[0].loc });
    g.ind = 0;
    for (const d of shared) sharedScope.vars.set(d.name, { kind: d.member.kind === "State" ? "state" : d.member.kind === "Computed" ? "computed" : "fn" });
    g.members(shared.map((d) => d.member), sharedScope);
    out.push(...g.lines, "");
  }
  const pages: string[] = [];
  twoWay = twoWayProps(program);
  slotsOf = new Map(program.decls.flatMap((d) => (d.kind === "Component" ? [[d.name, slotNames(d.view)] as const] : [])));
  for (const d of program.decls) {
    if (d.kind !== "Component") continue;
    while (marks.length < out.join("\n").split("\n").length) marks.push(undefined);
    const g = new ComponentGen(d);
    out.push(g.gen(), "");
    marks.push(d.loc, ...g.marks, d.loc, undefined); // `function X(...) {`, its lines, `}`, blank
    if (d.page) {
      const chain = layoutChain(program, d.layoutName);
      pages.push(`{ path: ${JSON.stringify(d.path ?? "/" + d.name.toLowerCase())}, comp: ${d.name}${chain.length ? `, layouts: [${chain.join(", ")}]` : ""}${d.requires ? `, requires: ${JSON.stringify(d.requires)}` : ""} }`);
    }
  }
  // No `page` at all: the app is its root component (`App`, or the last one that takes no props).
  if (!pages.length) {
    const comps = program.decls.filter((d): d is ComponentDecl => d.kind === "Component" && !d.layout && d.params.every((p) => p.default));
    const root = comps.find((c) => c.name === "App") ?? comps[comps.length - 1];
    if (root) pages.push(`{ path: "/", comp: ${root.name} }`);
  }
  out.push(`export const routes = [${pages.join(", ")}];`);
  out.push("export const start = (el, base) => $.start(routes, el, base);", "");
  return { js: out.join("\n"), marks };
}

// A source map (v3) from per-line marks: each generated line maps to the start of its .art line.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function vlq(n: number): string {
  let v = n < 0 ? (-n << 1) | 1 : n << 1, out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v) digit |= 32;
    out += B64[digit];
  } while (v);
  return out;
}
export function sourceMap(marks: (Loc | undefined)[], sources: { file: string; src: string }[]): string {
  const files = sources.map((s) => s.file);
  let prevSrc = 0, prevLine = 0, prevCol = 0;
  const lines = marks.map((m) => {
    const i = m ? files.indexOf(m.file) : -1;
    if (!m || i < 0) return "";
    const seg = vlq(0) + vlq(i - prevSrc) + vlq(m.line - 1 - prevLine) + vlq(m.col - 1 - prevCol);
    [prevSrc, prevLine, prevCol] = [i, m.line - 1, m.col - 1];
    return seg;
  });
  return JSON.stringify({ version: 3, sources: files, sourcesContent: sources.map((s) => s.src), names: [], mappings: lines.join(";") });
}

// What the server runtime needs: field types per model, each api's model and access, the auth api,
// and the compiled `server fn`s (an ES module exporting `fns`).
export type ServerSchema = {
  models: Record<string, Record<string, string>>;
  // Field rules per model (`min`, `max`, `match`, `unique`), only for fields that have some.
  rules: Record<string, Record<string, FieldRules>>;
  // Relations: per model, the fields that reference another stored model (by the api storing it).
  refs: Record<string, Record<string, { api: string; list: boolean }>>;
  // Field defaults per model (JSON values), for create and for migrating existing rows.
  defaults: Record<string, Record<string, unknown>>;
  apis: Record<string, { model: string; access: ApiAccess; readonly?: boolean }>;
  auth: string | null;
  // Sign-in providers of `auth ... with`.
  oauth?: string[];
  fns: string;
};

export function serverSchema(program: Program): ServerSchema | null {
  const apis: ServerSchema["apis"] = {};
  const models: ServerSchema["models"] = {};
  let auth: string | null = null;
  let oauth: string[] | undefined;
  const rules: ServerSchema["rules"] = {};
  const defaults: ServerSchema["defaults"] = {};
  for (const d of program.decls) {
    if (d.kind === "Api") apis[d.name] = { model: d.model, access: d.access, ...(d.readonly ? { readonly: true } : {}) };
    if (d.kind === "Model") {
      models[d.name] = Object.fromEntries(d.fields.map((f) => [f.name, printType(f.type)]));
      const withRules = d.fields.filter((f) => f.rules);
      if (withRules.length) rules[d.name] = Object.fromEntries(withRules.map((f) => [f.name, f.rules!]));
      const withDefault = d.fields.filter((f) => f.default);
      if (withDefault.length) defaults[d.name] = Object.fromEntries(withDefault.map((f) => [f.name, jsonValue(f.default!)]));
    }
    if (d.kind === "Auth") { auth = d.api; if (d.providers) oauth = d.providers; }
  }
  const fns = program.decls.filter((d) => d.kind === "ServerFn");
  if (!Object.keys(apis).length && !fns.length) return null;
  const apiOf = (m: string) => program.decls.find((d) => d.kind === "Api" && d.model === m)?.name;
  const refs: ServerSchema["refs"] = {};
  for (const d of program.decls) {
    if (d.kind !== "Model" || !apiOf(d.name)) continue;
    for (const f of d.fields) {
      const api = apiOf(f.type.name);
      if (api) (refs[d.name] ??= {})[f.name] = { api, list: f.type.list };
    }
  }
  return { models, rules, refs, defaults, apis, auth, ...(oauth ? { oauth } : {}), fns: serverFnsModule(program, fns) };
}

// Each server fn becomes `async name({ db, me, fail }, ...params)`.
function serverFnsModule(program: Program, fns: ServerFnDecl[]): string {
  const host: ComponentDecl = { kind: "Component", page: false, name: "server", path: null, params: [], members: [], view: [], loc: { file: "", line: 0, col: 0 } };
  // Server fns import only the `use` names they mention (client-only libraries stay out).
  const out = [...importLines(program, fns.map((f) => printDecl(f)).join("\n")), "export const fns = {"];
  const body = (f: ServerFnDecl) => {
    const g = new ComponentGen(host);
    g.ind = 2;
    const scope = new Scope(null);
    for (const name of ["db", "me", "fail", "email", ...f.params]) scope.vars.set(name, { kind: "param" });
    g.stmts(f.body, scope);
    return { g, scope };
  };
  const jobs = fns.filter((f) => f.every);
  for (const f of fns.filter((x) => !x.every)) {
    const g = new ComponentGen(host);
    g.ind = 2;
    const scope = new Scope(null);
    for (const name of ["db", "me", "fail", "email", ...f.params]) scope.vars.set(name, { kind: "param" });
    g.stmts(f.body, scope);
    out.push(`  async ${f.name}({ db, me, fail, email }${f.params.map((p, i) => `, ${p}${f.defaults?.[i] ? ` = ${g.expr(f.defaults[i]!, scope)}` : ""}`).join("")}) {`, ...g.lines, "  },");
  }
  out.push("};");
  // Scheduled jobs: { name: { every: ms, run } }.
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>;
  out.push("export const jobs = {");
  for (const f of jobs) {
    const { g } = body(f);
    out.push(`  ${f.name}: { every: ${Number(f.every!.slice(0, -1)) * ms[f.every!.slice(-1)]}, async run({ db, fail, email }) {`, ...g.lines, "  } },");
  }
  out.push("};");
  return out.join("\n");
}

export function serverEntry(schema: ServerSchema): string {
  const { fns, ...rest } = schema;
  return `import { serve } from "./server-runtime.js";\n\n${fns}\n\nserve(${JSON.stringify(rest)}, fns, new URL(".", import.meta.url), undefined, jobs);\n`;
}

// `head`/`body`: a prerendered page's extra <head> tags and the HTML inside #app.
// `css`: link app.css (the runtime's styles and the project's; its id tells the runtime not to add them again).
export function htmlShell(title = "ArtScript", head = "", body = "", css = false, base = "/"): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${head}${css ? `<link rel="stylesheet" id="art-css" href="${base}app.css">` : ""}</head><body><div id="app">${body}</div><script type="module" src="${base}app.js"></script></body></html>\n`;
}

// Top-level `state`, `computed` and `fn`: module-level, visible in every component.
let sharedScope = new Scope(null);

// Dev builds: each component reports its members to the dev tools.
let devMode = false;

class ComponentGen {
  c: ComponentDecl;
  lines: string[] = [];
  ind = 1;
  n = 0;
  constructor(c: ComponentDecl) {
    this.c = c;
  }

  // `marks[i]`: the .art location lines[i] comes from (for source maps).
  marks: (Loc | undefined)[] = [];
  at: Loc | undefined;
  emit(s: string) {
    this.lines.push("  ".repeat(this.ind) + s);
    for (const _ of s.split("\n")) this.marks.push(this.at); // a multi-line template literal spans lines
  }
  v(prefix = "e"): string { return `${prefix}${this.n++}`; }

  gen(): string {
    const c = this.c;
    this.at = c.loc;
    const scope = new Scope(sharedScope);
    for (const p of c.params) scope.vars.set(p.name, { kind: "prop" });
    // Pages read their route params and query string as props from the router.
    if (c.page) {
      for (const name of ["params", "query"]) {
        scope.vars.set(name, { kind: "prop" });
        this.emit(`const ${name} = $p.${name} ?? (() => ({}));`);
      }
    }
    // `data` compiles to a signal, so it reads and mutates like a state.
    for (const m of c.members) {
      if (m.kind !== "Mount" && m.kind !== "Effect" && m.kind !== "Style") scope.vars.set(m.name, { kind: m.kind === "Computed" ? "computed" : m.kind === "Fn" ? "fn" : m.kind === "Ref" ? "let" : m.kind === "Data" ? "data" : "state" });
    }
    for (const p of c.params) {
      const def = p.default ? `(() => ${this.expr(p.default, scope)})` : "(() => undefined)";
      this.emit(`const ${p.name} = $p.${p.name} ?? ${def};`);
    }
    this.members(c.members, scope);
    if (devMode) {
      this.at = c.loc;
      const entries = [...(c.page ? ["params", "query"] : []), ...c.params.map((p) => p.name)].map((n) => `${n}: ["prop", () => ${n}()]`);
      for (const m of c.members) {
        if (m.kind === "State") entries.push(`${m.name}: ["state", () => ${m.name}.v, ($v) => { ${m.name}.v = $v; }]`);
        else if (m.kind === "Computed" || m.kind === "Data") entries.push(`${m.name}: ["${m.kind.toLowerCase()}", () => ${m.name}.v]`);
      }
      this.emit(`$inspect(${JSON.stringify(c.name)}, { ${entries.join(", ")} });`);
    }
    this.view(c.view, "$parent", scope);
    for (const m of c.members) {
      if (m.kind !== "Mount" && m.kind !== "Effect") continue;
      this.emit(`$.${m.kind === "Mount" ? "$mount" : "$effect"}(${hasAwait(m.body) ? "async " : ""}() => {`);
      this.nested(() => this.stmts(m.body, scope.child()));
      this.emit("});");
    }
    return `function ${c.name}($p, $parent) {\n${this.lines.join("\n")}\n}`;
  }

  members(members: Member[], scope: Scope) {
    const c = this.c;
    for (const m of members) {
      this.at = m.loc;
      if (m.kind === "Mount" || m.kind === "Effect") continue; // after the view, so refs are set
      if (m.kind === "Style") { this.emit(`$.$scopedCss(${JSON.stringify(c.name)}, ${JSON.stringify(scopeCss(m.css, c.name))});`); continue; }
      if (m.kind === "Ref") this.emit(`let ${m.name} = null;`);
      else if (m.kind === "State") this.emit(`const ${m.name} = $.signal(${this.expr(m.init, scope)});`);
      else if (m.kind === "Computed") this.emit(`const ${m.name} = $.computed(() => ${this.expr(m.expr, scope)});`);
      else if (m.kind === "Data") {
        // Lists start as [] so views can iterate right away, counts as 0; anything else as null.
        const method = m.expr.kind === "Call" && m.expr.callee.kind === "Member" ? m.expr.callee.prop : "";
        this.emit(`const ${m.name} = $.$data(() => ${this.expr(m.expr, scope)}, ${method === "list" || m.startsEmpty ? "[]" : method === "count" ? "0" : "null"});`);
        if (m.live) this.emit("$.$live();");
      } else if (m.kind === "Fn") {
        const fs = scope.child();
        for (const p of m.params) fs.vars.set(p, { kind: "param" });
        const ps = m.params.map((p, i) => (m.defaults?.[i] ? `${p} = ${this.expr(m.defaults[i]!, scope)}` : p));
        this.emit(`${hasAwait(m.body) ? "async " : ""}function ${m.name}(${ps.join(", ")}) {`);
        this.ind++;
        this.stmts(m.body, fs);
        this.ind--;
        this.emit("}");
      }
    }
  }

  // ---------- view ----------
  view(nodes: ViewNode[], parent: string, scope: Scope) {
    for (const node of nodes) {
      this.at = node.loc;
      if (node.kind === "IfView") {
        const fa = this.v("f"), fb = this.v("f");
        this.emit(`$.$if(${parent}, () => ${this.expr(node.cond, scope)}, (${fa}) => {`);
        this.nested(() => this.view(node.then, fa, scope));
        if (node.else) {
          this.emit(`}, (${fb}) => {`);
          this.nested(() => this.view(node.else!, fb, scope));
          this.emit("});");
        } else this.emit("});");
      } else if (node.kind === "ForView") {
        const f = this.v("f");
        const s = scope.child();
        s.vars.set(node.item, { kind: "loop", sig: this.signalOf(node.list, scope) });
        if (node.index) s.vars.set(node.index, { kind: "loop" });
        const params = [f, node.item, ...(node.index ? [node.index] : [])].join(", ");
        let key = "";
        if (node.key) {
          const ks = scope.child();
          ks.vars.set(node.item, { kind: "param" });
          if (node.index) ks.vars.set(node.index, { kind: "param" });
          key = `, (${node.item}${node.index ? `, ${node.index}` : ""}) => ${this.expr(node.key, ks)}`;
        }
        // The item and index are signals: kept rows update in place instead of re-rendering.
        this.emit(`$.$for(${parent}, () => ${this.expr(node.list, scope)}, (${params}) => {`);
        const head = this.lines.length;
        this.nested(() => this.view(node.body, f, s));
        this.template(head, f);
        this.emit(`}${key});`);
      } else if (node.tag === "meta") {
        const props = node.props.filter((p) => p.value).map((p) => `${p.name}: () => ${this.expr(p.value!, scope)}`);
        this.emit(`$.$meta({ ${props.join(", ")} });`);
      } else if (node.tag === "slot") {
        // A layout's page or a component's children; `slot header` takes its `header { }` children.
        const name = node.content?.kind === "Ident" ? `$slot_${node.content.name}` : "$slot";
        this.emit(`$p.${name}?.(${parent});`);
      } else if (/^[A-Z]/.test(node.tag)) {
        // If the prop comes from a state, pass its signal so the child can notify mutations.
        const props = node.props.filter((p) => p.value).map((p) => {
          const get = `() => ${this.expr(p.value!, scope)}`;
          const sig = this.signalOf(p.value!, scope);
          // A prop the child assigns gets a setter that assigns the expression passed here.
          if (twoWay.get(node.tag)?.has(p.name)) {
            const s = scope.child();
            s.vars.set("$v", { kind: "param" });
            const set = this.expr({ kind: "Assign", op: "=", target: p.value!, value: { kind: "Ident", name: "$v", loc: p.loc }, loc: p.loc }, s);
            return `${p.name}: $.$ref(${get}, ${sig ?? "undefined"}, ($v) => ${set})`;
          }
          return `${p.name}: ${sig ? `$.$ref(${get}, ${sig})` : get}`;
        });
        if (node.children.length) {
          // Children named like a slot of the component (`header { }`) fill it; the rest, `slot`.
          const slots = slotsOf.get(node.tag) ?? new Set<string>();
          const fills = new Map<string, ViewNode[]>();
          for (const n of node.children) {
            const key = n.kind === "Element" && slots.has(n.tag) ? `$slot_${n.tag}` : "$slot";
            fills.set(key, [...(fills.get(key) ?? []), ...(key === "$slot" ? [n] : (n as Element).children)]);
          }
          this.emit(`${node.tag}({ ${props.join(", ")}${props.length ? ", " : ""}`);
          this.nested(() => {
            for (const [key, nodes] of fills) {
              const f = this.v("f");
              this.emit(`${key}: (${f}) => {`);
              this.nested(() => this.view(nodes, f, scope));
              this.emit("},");
            }
          });
          this.emit(`}, ${parent});`);
        } else this.emit(`${node.tag}({ ${props.join(", ")} }, ${parent});`);
      } else this.element(node, parent, scope);
    }
  }

  // A row whose body is static structure plus bindings is cloned from a template built once
  // (`$tpl`) instead of created node by node: in the browser the clones share their attributes,
  // which is what makes a long list cheap. Rows with anything else (an `if`, a nested list, a
  // component, an icon) keep the node-by-node code; the lines from `head` are left as they are.
  template(head: number, frag: string) {
    // Statements, with the lines a multi-line one spans (a `->` action's body, a nested arrow).
    const raw = this.lines.slice(head);
    const indent = (l: string) => l.length - l.trimStart().length;
    const base = raw.length ? indent(raw[0]) : 0;
    const body: string[] = [];
    for (const l of raw) {
      if (body.length && (indent(l) > base || l.trimStart().startsWith("}"))) body[body.length - 1] += "\n" + l; // keeps its indentation
      else body.push(l.trim());
    }
    type TNode = { tag: string; attrs: Record<string, string>; children: (TNode | string)[]; ref: string; parent: TNode | null; dyn: boolean };
    const nodes = new Map<string, TNode>(); // element var → node
    const roots: TNode[] = [];
    const kept: string[] = []; // the statements that stay, in order
    const textRefs = new Map<string, TNode>(); // text node var → its node
    const texts = new Map<TNode, number>(); // text node → index of its "" child
    const lit = (s: string): string | null => { try { const v = JSON.parse(s); return typeof v === "string" ? v : null; } catch { return null; } };
    const concat = (s: string): string | null => {
      const parts = s.split(" + ").map(lit);
      return parts.every((p) => p !== null) ? parts.join("") : null;
    };
    const ATTR_PROPS: Record<string, string> = { className: "class", id: "id", title: "title", placeholder: "placeholder", href: "href", src: "src", alt: "alt", target: "target", rel: "rel", type: "type", role: "role", name: "name", htmlFor: "for" };
    const BOOL_PROPS = new Set(["disabled", "required", "multiple", "readOnly", "hidden", "autofocus"]);
    let m: RegExpExecArray | null;
    for (const line of body) {
      if ((m = /^const (e\d+) = \$\.\$el\((\w+), "([\w-]+)"(?:, "([^"]*)")?\);$/.exec(line))) {
        const [, ref, parent, tag, cls] = m;
        const p = parent === frag ? null : nodes.get(parent);
        if (parent !== frag && !p) return;
        const n: TNode = { tag, attrs: cls ? { class: cls } : {}, children: [], ref, parent: p ?? null, dyn: false };
        if (p) p.children.push(n); else roots.push(n);
        nodes.set(ref, n);
      } else if ((m = /^(e\d+)\.textContent = (".*");$/.exec(line))) {
        const n = nodes.get(m[1]), v = lit(m[2]);
        if (!n || v === null) return;
        n.children.push(v);
      } else if ((m = /^(e\d+)\.setAttribute\((".*?"), (".*")\);$/.exec(line))) {
        const n = nodes.get(m[1]), k = lit(m[2]), v = lit(m[3]);
        if (!n || k === null || v === null) return;
        n.attrs[k] = v;
      } else if ((m = /^(e\d+)\.(\w+) = (.+);$/.exec(line)) && (ATTR_PROPS[m[2]] || BOOL_PROPS.has(m[2]))) {
        const n = nodes.get(m[1]);
        if (!n) return;
        if (BOOL_PROPS.has(m[2])) { if (m[3] !== "true") return; n.attrs[m[2].toLowerCase()] = ""; }
        else { const v = concat(m[3]); if (v === null) kept.push(line); else n.attrs[ATTR_PROPS[m[2]]] = v; }
      } else if ((m = /^\$\.\$text\((e\d+)\.appendChild\(document\.createTextNode\(""\)\), (.*)$/.exec(line))) {
        const n = nodes.get(m[1]);
        if (!n) return;
        const t = this.v("t");
        texts.set(n, n.children.length);
        n.children.push("");
        textRefs.set(t, n);
        kept.push(`$.$text(${t}, ${m[2]}`);
      } else if ((m = /^\$\.\$(text|attr|on|bind)\((e\d+), /.exec(line)) && !/^\$\.\$text\(e\d+\.appendChild/.test(line)) {
        const n = nodes.get(m[2]);
        if (!n) return;
        if (m[1] === "text") n.dyn = true;
        // A button with a click handler is `type=button` (see `$on`): in the template, so no row writes it.
        if (m[1] === "on" && n.tag === "button" && line.startsWith(`$.$on(${m[2]}, "click"`)) n.attrs.type = "button";
        kept.push(line);
      } else if (/^(e\d+)\.style\.cssText \+= /.test(line) || /^\w+ = e\d+;$/.test(line)) kept.push(line);
      else return; // something the template can't hold: the row stays as it is
    }
    if (!roots.length || [...nodes.values()].some((n) => n.dyn && n.children.length)) return;
    // The description, and the walk that gives each node its variable in the clone.
    const desc = (n: TNode | string): unknown => (typeof n === "string" ? n : [n.tag, Object.keys(n.attrs).length ? n.attrs : null, ...n.children.map(desc)]);
    const t = this.v("t");
    const walk: string[] = [];
    const visit = (n: TNode, expr: string) => {
      walk.push(`const ${n.ref} = ${expr};`);
      let prev: string | null = null;
      n.children.forEach((c, i) => {
        const at = prev === null ? `${n.ref}.firstChild` : `${prev}.nextSibling`;
        if (typeof c === "string") {
          const ref = [...textRefs].find(([, node]) => node === n && texts.get(n) === i)?.[0];
          if (ref) { walk.push(`const ${ref} = ${at};`); prev = ref; }
          else if (i < n.children.length - 1) { const tmp = this.v("t"); walk.push(`const ${tmp} = ${at};`); prev = tmp; }
        } else { visit(c, at); prev = c.ref; }
      });
    };
    const single = roots.length === 1;
    const clone = single ? roots[0].ref : this.v("r");
    const first: string[] = [`const ${clone} = $.$clone(${t});`];
    if (single) { visit(roots[0], clone); walk.shift(); }
    else roots.forEach((r, i) => visit(r, i === 0 ? `${clone}.firstChild` : `${roots[i - 1].ref}.nextSibling`));
    const out = [...first, ...walk, ...kept, `${frag}.appendChild(${clone});`];
    const mark = this.marks[head - 1];
    const pad = "  ".repeat(this.ind + 1);
    const lines = out.flatMap((l) => l.split("\n").map((x, i) => (i ? x : pad + x)));
    this.lines.splice(head, raw.length, ...lines);
    this.marks.splice(head, raw.length, ...lines.map(() => mark));
    // The template itself, once, before the list.
    this.lines.splice(head - 1, 0, "  ".repeat(this.ind) + `const ${t} = $.$tpl(${JSON.stringify(roots.map(desc))});`);
    this.marks.splice(head - 1, 0, mark);
  }

  nested(fn: () => void) {
    this.ind++;
    fn();
    this.ind--;
  }

  element(el: Element, parent: string, scope: Scope) {
    if (el.tag === "icon") return this.icon(el, parent, scope);
    const spec = ELEMENTS[el.tag];
    const isAttr = (name: string) => !!spec.attrs?.includes(name);
    const isFlag = (name: string) => spec.flags.includes(name) && !isAttr(name);
    const classes = [spec.cls, ...el.props.filter((p) => !p.value && isFlag(p.name)).map((p) => "a-" + p.name)].filter(Boolean).join(" ");

    // `label="Email"` wraps the control in a <label> (a group gets a labelled <div> instead).
    const label = el.props.find((p) => p.name === "label")?.value;
    if (label) {
      const w = this.v();
      const after = spec.type === "checkbox";
      this.emit(`const ${w} = $.$el(${parent}, "${spec.bind === "choice" && el.tag !== "select" ? "div" : "label"}", "a-field${after ? " a-check" : ""}");`);
      parent = w;
      if (!after) this.labelText(w, label, scope);
    }
    // A table sits in a block of its own: a wide one scrolls sideways instead of stretching the
    // page, and as a direct flex item (in a `column` or `card`) Chrome lays it out ~30% slower.
    if (spec.wrap) {
      const w = this.v();
      this.emit(`const ${w} = $.$el(${parent}, "div", "${spec.wrap}");`);
      parent = w;
    }
    const v = this.v();
    const tagProp = el.props.find((p) => p.name === "tag")?.value;
    const html = tagProp?.kind === "Ident" ? tagProp.name : tagProp?.kind === "Str" ? tagProp.value : spec.html;
    this.emit(`const ${v} = $.$el(${parent}, "${html}"${classes ? `, "${classes}"` : ""});`);
    if (this.c.members.some((m) => m.kind === "Style")) this.emit(`${v}.setAttribute("data-s", ${JSON.stringify(this.c.name)});`);
    if (spec.type) this.emit(`${v}.type = "${spec.type}";`);
    if (el.tag === "spinner") this.emit(`${v}.setAttribute("role", "status");`);
    if (label && spec.type === "checkbox") this.labelText(parent, label, scope);
    if (label && spec.bind === "choice" && el.tag !== "select") this.emit(`$.$attr(${v}, "aria-label", () => ${this.expr(label, scope)});`);
    // A field without a visible label is named by its placeholder (for screen readers and agents).
    const placeholder = el.props.find((p) => p.name === "placeholder")?.value;
    if (!label && placeholder && ["input", "textarea", "select"].includes(el.tag)) this.attr(v, "aria-label", placeholder, scope);

    const typeProp = el.props.find((p) => p.name === "type")?.value;
    const inputType = spec.type ?? (typeProp?.kind === "Ident" ? typeProp.name : typeProp?.kind === "Str" ? typeProp.value : null);
    const options = el.props.find((p) => p.name === "options")?.value;

    // `class` first: the classes other props add (responsive props, conditional flags) come after it.
    for (const p of [...el.props.filter((q) => q.name === "class"), ...el.props.filter((q) => q.name !== "class")]) {
      if (!p.value) {
        if (/^(aria|data)-/.test(p.name)) this.emit(`${v}.setAttribute(${JSON.stringify(p.name)}, "true");`);
        else if (p.name === "novalidate") this.emit(`${v}.setAttribute("novalidate", "");`);
        else if (isAttr(p.name)) this.emit(`${v}.${p.name} = true;`);
        continue;
      }
      const val = p.value;
      if (p.name === "label" || p.name === "options" || p.name === "tag" || p.name === "style") continue; // style: below, after the layout props
      if (p.name === "ref") {
        this.emit(`${printExprName(val)} = ${v};`);
        continue;
      }
      if (p.name.includes(":") && !p.name.startsWith("on:")) continue; // responsive: below
      if (val.kind === "Num" && el.props.some((q) => q.name.endsWith(":" + p.name))) {
        this.responsive(v, "", p.name, val.value); // the base must be a class too, to be overridable
        continue;
      }
      if (p.name.startsWith("on:")) {
        const s = scope.child();
        s.vars.set("event", { kind: "param" });
        const body = val.kind === "Arrow" ? `${this.expr(val, s)}(event)` : this.expr(val, s);
        this.emit(`$.$on(${v}, "${p.name.slice(3)}", ${exprHasAwait(val) ? "async " : ""}(event) => { ${body}; });`);
        continue;
      }
      if (isAttr(p.name)) {
        this.attr(v, p.name, val, scope);
        continue;
      }
      const lit = literal(val);
      // Keyword values (`type=email`, `align=center`) win over a variable with the same name,
      // as the checker assumes; other bare names are keywords only if nothing else declares them.
      const keyword = val.kind === "Ident" && (ENUM_PROPS[p.name]?.includes(val.name) || !scope.get(val.name));
      const word = keyword ? (val as Expr & { kind: "Ident" }).name : lit !== null ? String(lit) : null;
      if (isFlag(p.name)) {
        this.emit(`$.$class(${v}, "a-${p.name}", () => ${this.expr(val, scope)});`);
      } else if (SPACING_PROPS.has(p.name)) {
        const css = p.name === "pad" ? "padding" : "gap";
        if (typeof lit === "number") this.emit(`${v}.style.${css} = "${lit * 4}px";`);
        else this.emit(`$.$style(${v}, "${css}", () => ${this.expr(val, scope)} * 4 + "px");`);
      } else if (p.name === "align" || p.name === "justify") {
        const css = p.name === "align" ? "alignItems" : "justifyContent";
        if (word !== null && ALIGN[word]) this.emit(`${v}.style.${css} = "${ALIGN[word]}";`);
      } else if (p.name === "cols") {
        if (typeof lit === "number") this.emit(`${v}.style.gridTemplateColumns = "repeat(${lit}, minmax(0, 1fr))";`);
        else this.emit(`$.$style(${v}, "gridTemplateColumns", () => \`repeat(\${${this.expr(val, scope)}}, minmax(0, 1fr))\`);`);
      } else if (p.name === "type") {
        if (word !== null) this.emit(`${v}.type = ${JSON.stringify(word)};`);
      } else if (p.name === "placeholder" && el.tag === "select") {
        this.emit(`${v}.$placeholder = ${this.expr(val, scope)};`);
      } else if (p.name === "to") {
        this.attr(v, "href", val, scope); // internal links navigate without reloading (see the router)
      } else if (p.name === "class") {
        this.attr(v, "className", val, scope, (s) => (classes ? `${JSON.stringify(classes + " ")} + ${s}` : s));
      } else this.attr(v, p.name, val, scope);
    }

    if (el.content) {
      const c = el.content;
      if (spec.content === "text") {
        const lit = literal(c);
        // An empty `text` only carries a class (an icon font): decorative, hidden from screen readers.
        if (lit === "" && el.tag === "text") this.emit(`${v}.setAttribute("aria-hidden", "true");`);
        else if (lit !== null) this.emit(`${v}.textContent = ${JSON.stringify(String(lit))};`);
        // With children, the text gets its own node so updating it doesn't remove them.
        else if (el.children.length) this.emit(`$.$text(${v}.appendChild(document.createTextNode("")), () => ${this.expr(c, scope)});`);
        else this.emit(`$.$text(${v}, () => ${this.expr(c, scope)});`);
      } else if (spec.content === "src") this.attr(v, "src", c, scope);
      else if (spec.content === "bind") {
        const s = scope.child();
        s.vars.set("$v", { kind: "param" });
        const set = this.expr({ kind: "Assign", op: "=", target: c, value: { kind: "Ident", name: "$v", loc: c.loc }, loc: c.loc }, s);
        const get = `() => ${this.expr(c, scope)}`;
        const opts = options ? `() => ${this.expr(options, scope)}` : "() => []";
        if (spec.bind === "choice") this.emit(`$.$choice(${v}, "${el.tag}", ${opts}, ${get}, ($v) => ${set});`);
        else {
          const mode = spec.bind ?? (inputType === "checkbox" ? "checked" : inputType === "number" ? "number" : "value");
          this.emit(`$.$bind(${v}, ${get}, ($v) => ${set}, "${mode}");`);
        }
      }
    }

    for (const p of el.props) {
      const [bp, name] = p.name.split(":");
      if (name && bp !== "on" && p.value?.kind === "Num") this.responsive(v, bp, name, p.value.value);
    }
    const style = el.props.find((p) => p.name === "style")?.value;
    if (style) this.attr(v, "style", style, scope);

    if (el.action && spec.action) {
      this.emit(`$.$on(${v}, "${spec.action}", ${hasAwait(el.action) ? "async " : ""}() => {`);
      this.nested(() => this.stmts(el.action!, scope.child()));
      this.emit("});");
    }
    // Rows go in a <tbody>, as the HTML parser would put them.
    let inner = v;
    if (el.tag === "table") {
      inner = this.v();
      this.emit(`const ${inner} = $.$el(${v}, "tbody");`);
    }
    this.view(el.children, inner, scope);
  }

  // `md:cols=3` → class a-md-cols-3 with its rule in a media query. Larger breakpoints repeat the
  // selector so they win over smaller ones regardless of rule order.
  responsive(v: string, bp: string, name: string, n: number) {
    const cls = `a-${bp ? bp + "-" : ""}${name}-${n}`;
    const decl = name === "cols" ? `grid-template-columns:repeat(${n},minmax(0,1fr))` : `${name === "pad" ? "padding" : "gap"}:${n * 4}px`;
    const weight = bp ? Object.keys(BREAKPOINTS).indexOf(bp) + 2 : 1;
    const rule = `${`.${cls}`.repeat(weight)}{${decl}}`;
    this.emit(`$.$css(${v}, "${cls}", "${bp ? `@media(min-width:${BREAKPOINTS[bp]}px){${rule}}` : rule}");`);
  }

  // The icon's SVG markup is inlined here, so the app carries only the icons it uses.
  icon(el: Element, parent: string, scope: Scope) {
    const name = el.content?.kind === "Str" ? el.content.value : "";
    const v = this.v();
    const flags = el.props.filter((p) => !p.value && p.name !== "size" && p.name !== "label" && !/^(aria|data)-/.test(p.name)).map((p) => ` a-${p.name}`).join("");
    const size = el.props.find((p) => p.name === "size")?.value;
    const label = el.props.find((p) => p.name === "label")?.value;
    this.emit(`const ${v} = $.$icon(${parent}, ${JSON.stringify(ICONS[name] ?? "")}, ${size ? this.expr(size, scope) : 20}, ${label ? this.expr(label, scope) : "null"}, ${JSON.stringify("a-icon" + flags)});`);
    for (const p of el.props) {
      if (!p.value && /^(aria|data)-/.test(p.name)) this.emit(`${v}.setAttribute(${JSON.stringify(p.name)}, "true");`);
      if (!p.value) continue;
      if (p.name === "class") this.attr(v, "className", p.value, scope, (s) => `${JSON.stringify("a-icon" + flags + " ")} + ${s}`);
      else if (p.name === "id" || p.name === "style" || p.name === "role" || /^(aria|data)-/.test(p.name)) this.attr(v, p.name, p.value, scope);
    }
  }

  labelText(parent: string, val: Expr, scope: Scope) {
    const s = this.v();
    this.emit(`const ${s} = $.$el(${parent}, "span");`);
    this.attr(s, "textContent", val, scope);
  }

  attr(v: string, name: string, val: Expr, scope: Scope, wrap = (s: string) => s) {
    const lit = literal(val);
    // ARIA attributes are set as attributes (not every browser reflects them as properties).
    if (lit !== null && (name === "role" || name.startsWith("aria-") || name.startsWith("data-"))) return this.emit(`${v}.setAttribute(${JSON.stringify(name)}, ${JSON.stringify(String(lit))});`);
    // Added to the element's own styles (`gap`, `pad`...), not instead of them.
    if (lit !== null && name === "style") return this.emit(`${v}.style.cssText += ${JSON.stringify(";" + lit)};`);
    // A root-relative URL gets the app's base path (`art build --base`).
    if (lit !== null) this.emit(`${v}.${name} = ${wrap(typeof lit === "string" && /^\/(?!\/)/.test(lit) && ["href", "src", "poster"].includes(name) ? `$.withBase(${JSON.stringify(lit)})` : JSON.stringify(lit))};`);
    else this.emit(`$.$attr(${v}, "${name}", () => ${wrap(this.expr(val, scope))});`);
  }

  // ---------- statements ----------
  stmts(list: Stmt[], scope: Scope) {
    for (const s of list) {
      this.at = s.loc;
      if (s.kind === "ExprStmt") this.emit(this.expr(s.expr, scope) + ";");
      else if (s.kind === "Let") {
        this.emit(`let ${s.name} = ${this.expr(s.init, scope)};`);
        // `let found = cart.find(...)`: mutating `found` must still notify `cart`.
        scope.vars.set(s.name, { kind: "let", sig: this.signalOf(s.init, scope) });
      } else if (s.kind === "Return") this.emit(s.value ? `return ${this.expr(s.value, scope)};` : "return;");
      else if (s.kind === "Loop") {
        const body = scope.child();
        body.vars.set(s.name, { kind: "let" });
        this.emit(`for (let ${s.name} = ${this.expr(s.init, scope)}; ${this.expr(s.cond, body)}; ${this.expr(s.update, body)}) {`);
        this.nested(() => this.stmts(s.body, body));
        this.emit("}");
      }
      else if (s.kind === "For") {
        const body = scope.child();
        // Changing an item in place (`for t in todos { t.done = true }`) notifies the list's state.
        body.vars.set(s.item, { kind: "let", sig: this.signalOf(s.list, scope) });
        if (s.index) body.vars.set(s.index, { kind: "let" });
        const list = this.expr(s.list, scope);
        this.emit(s.index ? `for (const [${s.index}, ${s.item}] of (${list}).entries()) {` : `for (const ${s.item} of ${list}) {`);
        this.nested(() => this.stmts(s.body, body));
        this.emit("}");
      }
      else if (s.kind === "Cleanup") {
        this.emit("$.onDispose(() => {");
        this.nested(() => this.stmts(s.body, scope.child()));
        this.emit("});");
      }
      else if (s.kind === "Try") {
        this.emit("try {");
        this.nested(() => this.stmts(s.body, scope.child()));
        const h = scope.child();
        if (s.param) h.vars.set(s.param, { kind: "let" });
        if (!s.rethrow) {
          this.emit(s.param ? `} catch (${s.param}) {` : "} catch {");
          this.nested(() => this.stmts(s.handler, h));
        }
        if (s.finally) {
          this.emit("} finally {");
          this.nested(() => this.stmts(s.finally!, scope.child()));
        }
        this.emit("}");
      } else if (s.kind === "While") {
        this.emit(`while (${this.expr(s.cond, scope)}) {`);
        this.nested(() => this.stmts(s.body, scope.child()));
        this.emit("}");
      } else {
        this.emit(`if (${this.expr(s.cond, scope)}) {`);
        this.nested(() => this.stmts(s.then, scope.child()));
        if (s.else) {
          this.emit("} else {");
          this.nested(() => this.stmts(s.else!, scope.child()));
        }
        this.emit("}");
      }
    }
  }

  // ---------- expressions ----------
  // Signal to notify when the expression is mutated: the root state, or the state a loop iterates over.
  signalOf(e: Expr, scope: Scope): string | undefined {
    while (e.kind === "Member" || e.kind === "Index" || (e.kind === "Call" && e.callee.kind === "Member")) {
      e = e.kind === "Call" ? (e.callee as Expr & { kind: "Member" }).object : e.object;
    }
    if (e.kind !== "Ident") return undefined;
    const sym = scope.get(e.name);
    if (sym?.kind === "state" || sym?.kind === "data" || sym?.kind === "computed") return e.name;
    if (sym?.kind === "prop") return `${e.name}.sig`;
    return sym?.sig;
  }

  expr(e: Expr, scope: Scope): string {
    const x = (y: Expr) => this.expr(y, scope);
    switch (e.kind) {
      case "Num": return String(e.value);
      case "Str": return JSON.stringify(e.value);
      case "Template": return "`" + e.quasis.map((q, i) => q.replace(/[`\\]|\$(?=\{)/g, "\\$&") + (i < e.exprs.length ? "${" + x(e.exprs[i]) + "}" : "")).join("") + "`";
      case "Bool": return String(e.value);
      case "Null": return "null";
      case "Ident": {
        const sym = scope.get(e.name);
        if (sym?.kind === "state" || sym?.kind === "data" || sym?.kind === "computed" || sym?.kind === "loop") return `${e.name}.v`;
        if (sym?.kind === "prop") return `${e.name}()`;
        return e.name;
      }
      case "Member":
        if (e.object.kind === "Ident" && scope.get(e.object.name)?.kind === "data" && ["loading", "error", "reload"].includes(e.prop)) {
          return e.prop === "reload" ? `${e.object.name}.reload` : `${e.object.name}.${e.prop}.v`;
        }
        return `${this.wrapPostfix(e.object, scope)}${e.optional ? "?." : "."}${e.prop}`;
      case "Index": return `${this.wrapPostfix(e.object, scope)}${e.optional ? "?.[" : "["}${x(e.index)}]`;
      case "Call": {
        // `rows.forEach(r => r.done = true)`: the callback's item belongs to the state it iterates,
        // so mutating it notifies that state alone. (A computed's items belong to other states.)
        let owner = e.callee.kind === "Member" && ITERATORS.has(e.callee.prop) ? this.signalOf(e.callee.object, scope) : undefined;
        if (owner && !["state", "data"].includes(scope.get(owner)?.kind ?? "")) owner = undefined;
        const args = e.args.map((a) => (owner && a.kind === "Arrow" ? this.arrow(a, scope, owner) : x(a)));
        const call = `${this.wrapPostfix(e.callee, scope)}${e.optional ? "?.(" : "("}${args.join(", ")})`;
        if (e.callee.kind === "Member" && MUTATORS.has(e.callee.prop)) {
          const sig = this.notifier(e.callee.object, scope);
          if (sig) return `$.$m(${sig}, ${call})`;
        }
        return call;
      }
      case "Unary": return e.op === "typeof" || e.op === "await" || e.op === "new" ? `(${e.op} ${x(e.arg)})` : `${e.op}(${x(e.arg)})`;
      case "Update": {
        if (this.isProp(e.arg, scope)) return `${x(e.arg)}.set(${x(e.arg)}() ${e.op[0]} 1)`.replace(/\(\)\.set/, ".set");
        return this.mutation(e.arg, e.prefix ? `${e.op}${x(e.arg)}` : `${x(e.arg)}${e.op}`, scope);
      }
      case "Binary": return `(${x(e.left)} ${JS_OPS[e.op] ?? e.op} ${x(e.right)})`;
      case "Cond": return `(${x(e.test)} ? ${x(e.then)} : ${x(e.else)})`;
      case "Assign": {
        // A prop assigned directly: two-way, so it calls the setter the parent passed.
        if (this.isProp(e.target, scope)) {
          const name = (e.target as Expr & { kind: "Ident" }).name;
          return e.op === "=" ? `${name}.set(${x(e.value)})` : `${name}.set(${name}() ${e.op.slice(0, -1)} (${x(e.value)}))`;
        }
        return this.mutation(e.target, `${x(e.target)} ${e.op} ${x(e.value)}`, scope);
      }
      case "Array": return `[${e.items.map(x).join(", ")}]`;
      // In parentheses: as the body of a `() => ...` it would otherwise read as a block.
      case "Object": return `({ ${e.props.map((p) => ("spread" in p ? `...${x(p.spread)}` : "computed" in p ? `[${x(p.computed)}]: ${x(p.value)}` : `${JSON.stringify(p.key)}: ${x(p.value)}`)).join(", ")} })`;
      case "Arrow": return this.arrow(e, scope);
      case "Spread": return `...${x(e.arg)}`;
      case "Regex": return e.source;
    }
  }

  // `itemSig`: the signal that owns the first parameter (the callback of `state.forEach(...)`).
  arrow(e: Expr & { kind: "Arrow" }, scope: Scope, itemSig?: string): string {
    const s = scope.child();
    e.params.forEach((p, i) => s.vars.set(p, i === 0 && itemSig ? { kind: "let", sig: itemSig } : { kind: "param" }));
    const asyncKw = (Array.isArray(e.body) ? hasAwait(e.body) : exprHasAwait(e.body)) ? "async " : "";
    if (!Array.isArray(e.body)) {
      const b = this.expr(e.body, s);
      return `(${asyncKw}(${e.params.join(", ")}) => ${b})`;
    }
    const sub = new ComponentGen(this.c);
    sub.n = this.n;
    sub.ind = 0;
    sub.stmts(e.body, s);
    return `(${asyncKw}(${e.params.join(", ")}) => { ${sub.lines.join(" ")} })`;
  }

  wrapPostfix(e: Expr, scope: Scope): string {
    const s = this.expr(e, scope);
    return e.kind === "Ident" || e.kind === "Member" || e.kind === "Index" || e.kind === "Call" ? s : `(${s})`;
  }

  // Direct assignment to a state uses its setter; nested mutations notify the root signal.
  mutation(target: Expr, code: string, scope: Scope): string {
    if (target.kind === "Ident") return code;
    const sig = this.notifier(target, scope);
    return sig ? `$.$m(${sig}, ${code})` : code;
  }

  // What to notify when `target` is mutated in place. A computed's items belong to the states it
  // derives from, which aren't known here: every state is notified.
  notifier(target: Expr, scope: Scope): string | undefined {
    const sig = this.signalOf(target, scope);
    if (sig && scope.get(sig)?.kind === "computed") return this.c.name === "server" ? undefined : "$.$all";
    return sig ?? this.untracked(target, scope);
  }

  isProp(e: Expr, scope: Scope): boolean {
    return e.kind === "Ident" && scope.get(e.name)?.kind === "prop";
  }

  // A mutation through a parameter (`fn add(p) { p.stock-- }`, `xs.forEach(x => x.done = true)`)
  // can't know which state owns the object: it notifies every state (`$.$all`).
  untracked(e: Expr, scope: Scope): string | undefined {
    if (this.c.name === "server") return undefined; // server fns have no UI to update
    while (e.kind === "Member" || e.kind === "Index" || (e.kind === "Call" && e.callee.kind === "Member")) {
      e = e.kind === "Call" ? (e.callee as Expr & { kind: "Member" }).object : e.object;
    }
    return e.kind === "Ident" && scope.get(e.name)?.kind === "param" ? "$.$all" : undefined;
  }
}

// Whether code uses `await` directly (not inside a nested arrow, which gets its own async).
function exprHasAwait(e: Expr): boolean {
  switch (e.kind) {
    case "Unary": return e.op === "await" || exprHasAwait(e.arg);
    case "Arrow": return false;
    case "Template": return e.exprs.some(exprHasAwait);
    case "Member": return exprHasAwait(e.object);
    case "Index": return exprHasAwait(e.object) || exprHasAwait(e.index);
    case "Call": return exprHasAwait(e.callee) || e.args.some(exprHasAwait);
    case "Update": case "Spread": return exprHasAwait(e.arg);
    case "Binary": return exprHasAwait(e.left) || exprHasAwait(e.right);
    case "Cond": return exprHasAwait(e.test) || exprHasAwait(e.then) || exprHasAwait(e.else);
    case "Assign": return exprHasAwait(e.target) || exprHasAwait(e.value);
    case "Array": return e.items.some(exprHasAwait);
    case "Object": return e.props.some((p) => ("spread" in p ? exprHasAwait(p.spread) : exprHasAwait(p.value) || ("computed" in p && exprHasAwait(p.computed))));
    default: return false;
  }
}

function hasAwait(stmts: Stmt[]): boolean {
  return stmts.some((s) => {
    if (s.kind === "ExprStmt") return exprHasAwait(s.expr);
    if (s.kind === "Let") return exprHasAwait(s.init);
    if (s.kind === "Return") return s.value !== null && exprHasAwait(s.value);
    if (s.kind === "Try") return hasAwait(s.body) || hasAwait(s.handler) || hasAwait(s.finally ?? []);
    if (s.kind === "While") return exprHasAwait(s.cond) || hasAwait(s.body);
    if (s.kind === "Cleanup") return false;
    if (s.kind === "Loop") return hasAwait(s.body);
    if (s.kind === "For") return exprHasAwait(s.list) || hasAwait(s.body);
    return exprHasAwait(s.cond) || hasAwait(s.then) || (s.else !== null && hasAwait(s.else));
  });
}

// The value of a literal field default (`0`, `-1`, `""`, `false`, `null`, `[]`).
function jsonValue(e: Expr): unknown {
  if (e.kind === "Str" || e.kind === "Num" || e.kind === "Bool") return e.value;
  if (e.kind === "Unary" && e.arg.kind === "Num") return -e.arg.value;
  return e.kind === "Array" ? [] : null;
}

const printExprName = (e: Expr) => (e.kind === "Ident" ? e.name : "undefined");

function literal(e: Expr): string | number | boolean | null {
  if (e.kind === "Str" || e.kind === "Num" || e.kind === "Bool") return e.value;
  return null;
}
