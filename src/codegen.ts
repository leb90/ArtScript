// Generates an ES module that builds the DOM directly (no virtual DOM) using runtime.js.
import type { ApiAccess, ComponentDecl, FieldRules, Element, Expr, Program, ServerFnDecl, Stmt, ViewNode } from "./ast.ts";
import { specifier } from "./modules.ts";
import { printDecl, printType } from "./printer.ts";
import { BREAKPOINTS, ELEMENTS, ENUM_PROPS, SPACING_PROPS } from "./elements.ts";
import { twoWayProps } from "./checker.ts";

// Props each component assigns (bound two-way), for the program being generated.
let twoWay = new Map<string, Set<string>>();

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
const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "delete", "add", "clear"]);
const ALIGN: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", stretch: "stretch", between: "space-between", around: "space-around" };
const JS_OPS: Record<string, string> = { "==": "===", "!=": "!==" };

// `use` declarations as ES imports; only those whose names appear in `onlyFor` when given.
function importLines(program: Program, onlyFor?: string): string[] {
  const out: string[] = [];
  for (const d of program.decls) {
    if (d.kind !== "Use") continue;
    const used = (n: string) => onlyFor === undefined || new RegExp(`\\b${n}\\b`).test(onlyFor);
    const def = d.default && used(d.default) ? d.default : null;
    const names = d.names.filter(used);
    if (!def && !names.length) continue;
    const what = [def, names.length ? `{ ${names.join(", ")} }` : null].filter(Boolean).join(", ");
    out.push(`import ${what} from ${JSON.stringify(specifier(d.source, d.loc.file))};`);
  }
  return out;
}

export function generate(program: Program): string {
  const out: string[] = ['import * as $ from "./runtime.js";', ...importLines(program), "const navigate = $.navigate;", ""];
  const apis = program.decls.filter((d) => d.kind === "Api");
  // Typed REST client: one entry per `api` declaration.
  if (apis.length) out.push(`const api = { ${apis.map((a) => `${a.name}: $.$api(${JSON.stringify(a.name)})`).join(", ")} };`, "");
  if (program.decls.some((d) => d.kind === "Auth")) out.push("const auth = $.$auth();", "");
  if (program.decls.some((d) => d.kind === "ServerFn")) out.push("const server = $.$server();", "");
  const pages: string[] = [];
  twoWay = twoWayProps(program);
  for (const d of program.decls) {
    if (d.kind !== "Component") continue;
    out.push(new ComponentGen(d).gen(), "");
    if (d.page) {
      // Without an explicit layout, a page uses the only layout there is (if exactly one).
      const layouts = program.decls.filter((x) => x.kind === "Component" && x.layout);
      const layout = d.layoutName ?? (layouts.length === 1 ? layouts[0].name : null);
      pages.push(`{ path: ${JSON.stringify(d.path ?? "/" + d.name.toLowerCase())}, comp: ${d.name}${layout ? `, layout: ${layout}` : ""} }`);
    }
  }
  out.push(`export const routes = [${pages.join(", ")}];`);
  out.push("export const start = (el) => $.start(routes, el);", "");
  return out.join("\n");
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
  apis: Record<string, { model: string; access: ApiAccess }>;
  auth: string | null;
  fns: string;
};

export function serverSchema(program: Program): ServerSchema | null {
  const apis: ServerSchema["apis"] = {};
  const models: ServerSchema["models"] = {};
  let auth: string | null = null;
  const rules: ServerSchema["rules"] = {};
  const defaults: ServerSchema["defaults"] = {};
  for (const d of program.decls) {
    if (d.kind === "Api") apis[d.name] = { model: d.model, access: d.access };
    if (d.kind === "Model") {
      models[d.name] = Object.fromEntries(d.fields.map((f) => [f.name, printType(f.type)]));
      const withRules = d.fields.filter((f) => f.rules);
      if (withRules.length) rules[d.name] = Object.fromEntries(withRules.map((f) => [f.name, f.rules!]));
      const withDefault = d.fields.filter((f) => f.default);
      if (withDefault.length) defaults[d.name] = Object.fromEntries(withDefault.map((f) => [f.name, jsonValue(f.default!)]));
    }
    if (d.kind === "Auth") auth = d.api;
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
  return { models, rules, refs, defaults, apis, auth, fns: serverFnsModule(program, fns) };
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
// `css`: the project has its own styles (app.css), linked last so they override the runtime's.
export function htmlShell(title = "ArtScript", head = "", body = "", css = false): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${head}${css ? '<link rel="stylesheet" href="/app.css">' : ""}</head><body><div id="app">${body}</div><script type="module" src="/app.js"></script></body></html>\n`;
}

class ComponentGen {
  c: ComponentDecl;
  lines: string[] = [];
  ind = 1;
  n = 0;
  constructor(c: ComponentDecl) {
    this.c = c;
  }

  emit(s: string) { this.lines.push("  ".repeat(this.ind) + s); }
  v(prefix = "e"): string { return `${prefix}${this.n++}`; }

  gen(): string {
    const c = this.c;
    const scope = new Scope(null);
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
      if (m.kind !== "Mount" && m.kind !== "Effect") scope.vars.set(m.name, { kind: m.kind === "Computed" ? "computed" : m.kind === "Fn" ? "fn" : m.kind === "Ref" ? "let" : m.kind === "Data" ? "data" : "state" });
    }
    for (const p of c.params) {
      const def = p.default ? `(() => ${this.expr(p.default, scope)})` : "(() => undefined)";
      this.emit(`const ${p.name} = $p.${p.name} ?? ${def};`);
    }
    for (const m of c.members) {
      if (m.kind === "Mount" || m.kind === "Effect") continue; // after the view, so refs are set
      if (m.kind === "Ref") this.emit(`let ${m.name} = null;`);
      else if (m.kind === "State") this.emit(`const ${m.name} = $.signal(${this.expr(m.init, scope)});`);
      else if (m.kind === "Computed") this.emit(`const ${m.name} = $.computed(() => ${this.expr(m.expr, scope)});`);
      else if (m.kind === "Data") {
        // Lists start as [] so views can iterate right away, counts as 0; anything else as null.
        const method = m.expr.kind === "Call" && m.expr.callee.kind === "Member" ? m.expr.callee.prop : "";
        this.emit(`const ${m.name} = $.$data(() => ${this.expr(m.expr, scope)}, ${method === "list" ? "[]" : method === "count" ? "0" : "null"});`);
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
    this.view(c.view, "$parent", scope);
    for (const m of c.members) {
      if (m.kind !== "Mount" && m.kind !== "Effect") continue;
      this.emit(`$.${m.kind === "Mount" ? "$mount" : "$effect"}(${hasAwait(m.body) ? "async " : ""}() => {`);
      this.nested(() => this.stmts(m.body, scope.child()));
      this.emit("});");
    }
    return `function ${c.name}($p, $parent) {\n${this.lines.join("\n")}\n}`;
  }

  // ---------- view ----------
  view(nodes: ViewNode[], parent: string, scope: Scope) {
    for (const node of nodes) {
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
        this.nested(() => this.view(node.body, f, s));
        this.emit(`}${key});`);
      } else if (node.tag === "meta") {
        const props = node.props.filter((p) => p.value).map((p) => `${p.name}: () => ${this.expr(p.value!, scope)}`);
        this.emit(`$.$meta({ ${props.join(", ")} });`);
      } else if (node.tag === "slot") {
        this.emit(`$p.$slot?.(${parent});`); // a layout's page, or a component's children
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
          const f = this.v("f");
          this.emit(`${node.tag}({ ${[...props, `$slot: (${f}) => {`].join(", ")}`);
          this.nested(() => this.view(node.children, f, scope));
          this.emit(`} }, ${parent});`);
        } else this.emit(`${node.tag}({ ${props.join(", ")} }, ${parent});`);
      } else this.element(node, parent, scope);
    }
  }

  nested(fn: () => void) {
    this.ind++;
    fn();
    this.ind--;
  }

  element(el: Element, parent: string, scope: Scope) {
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
    const v = this.v();
    this.emit(`const ${v} = $.$el(${parent}, "${spec.html}"${classes ? `, "${classes}"` : ""});`);
    if (spec.type) this.emit(`${v}.type = "${spec.type}";`);
    if (el.tag === "spinner") this.emit(`${v}.setAttribute("role", "status");`);
    if (label && spec.type === "checkbox") this.labelText(parent, label, scope);
    if (label && spec.bind === "choice" && el.tag !== "select") this.emit(`$.$attr(${v}, "aria-label", () => ${this.expr(label, scope)});`);

    const typeProp = el.props.find((p) => p.name === "type")?.value;
    const inputType = spec.type ?? (typeProp?.kind === "Ident" ? typeProp.name : typeProp?.kind === "Str" ? typeProp.value : null);
    const options = el.props.find((p) => p.name === "options")?.value;

    for (const p of el.props) {
      if (!p.value) {
        if (isAttr(p.name)) this.emit(`${v}.${p.name} = true;`);
        continue;
      }
      const val = p.value;
      if (p.name === "label" || p.name === "options") continue;
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
        this.attr(v, "className", val, scope, (s) => (spec.cls ? `${JSON.stringify(classes + " ")} + ${s}` : s));
      } else this.attr(v, p.name, val, scope);
    }

    if (el.content) {
      const c = el.content;
      if (spec.content === "text") {
        const lit = literal(c);
        if (lit !== null) this.emit(`${v}.textContent = ${JSON.stringify(String(lit))};`);
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

    if (el.action && spec.action) {
      this.emit(`$.$on(${v}, "${spec.action}", ${hasAwait(el.action) ? "async " : ""}() => {`);
      this.nested(() => this.stmts(el.action!, scope.child()));
      this.emit("});");
    }
    this.view(el.children, v, scope);
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

  labelText(parent: string, val: Expr, scope: Scope) {
    const s = this.v();
    this.emit(`const ${s} = $.$el(${parent}, "span");`);
    this.attr(s, "textContent", val, scope);
  }

  attr(v: string, name: string, val: Expr, scope: Scope, wrap = (s: string) => s) {
    const lit = literal(val);
    if (lit !== null) this.emit(`${v}.${name} = ${wrap(JSON.stringify(lit))};`);
    else this.emit(`$.$attr(${v}, "${name}", () => ${wrap(this.expr(val, scope))});`);
  }

  // ---------- statements ----------
  stmts(list: Stmt[], scope: Scope) {
    for (const s of list) {
      if (s.kind === "ExprStmt") this.emit(this.expr(s.expr, scope) + ";");
      else if (s.kind === "Let") {
        this.emit(`let ${s.name} = ${this.expr(s.init, scope)};`);
        // `let found = cart.find(...)`: mutating `found` must still notify `cart`.
        scope.vars.set(s.name, { kind: "let", sig: this.signalOf(s.init, scope) });
      } else if (s.kind === "Return") this.emit(s.value ? `return ${this.expr(s.value, scope)};` : "return;");
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
        this.emit(s.param ? `} catch (${s.param}) {` : "} catch {");
        this.nested(() => this.stmts(s.handler, h));
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
        const call = `${this.wrapPostfix(e.callee, scope)}${e.optional ? "?.(" : "("}${e.args.map(x).join(", ")})`;
        if (e.callee.kind === "Member" && MUTATORS.has(e.callee.prop)) {
          const sig = this.signalOf(e.callee.object, scope) ?? this.untracked(e.callee.object, scope);
          if (sig) return `$.$m(${sig}, ${call})`;
        }
        return call;
      }
      case "Unary": return e.op === "typeof" || e.op === "await" ? `(${e.op} ${x(e.arg)})` : `${e.op}(${x(e.arg)})`;
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
      case "Object": return `{ ${e.props.map((p) => ("spread" in p ? `...${x(p.spread)}` : `${JSON.stringify(p.key)}: ${x(p.value)}`)).join(", ")} }`;
      case "Arrow": {
        const s = scope.child();
        for (const p of e.params) s.vars.set(p, { kind: "param" });
        const asyncKw = (Array.isArray(e.body) ? hasAwait(e.body) : exprHasAwait(e.body)) ? "async " : "";
        if (!Array.isArray(e.body)) {
          const b = this.expr(e.body, s);
          return `(${asyncKw}(${e.params.join(", ")}) => ${e.body.kind === "Object" ? `(${b})` : b})`;
        }
        const sub = new ComponentGen(this.c);
        sub.n = this.n;
        sub.ind = 0;
        sub.stmts(e.body, s);
        return `(${asyncKw}(${e.params.join(", ")}) => { ${sub.lines.join(" ")} })`;
      }
      case "Spread": return `...${x(e.arg)}`;
    }
  }

  wrapPostfix(e: Expr, scope: Scope): string {
    const s = this.expr(e, scope);
    return e.kind === "Ident" || e.kind === "Member" || e.kind === "Index" || e.kind === "Call" ? s : `(${s})`;
  }

  // Direct assignment to a state uses its setter; nested mutations notify the root signal.
  mutation(target: Expr, code: string, scope: Scope): string {
    if (target.kind === "Ident") return code;
    const sig = this.signalOf(target, scope) ?? this.untracked(target, scope);
    return sig ? `$.$m(${sig}, ${code})` : code;
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
    case "Object": return e.props.some((p) => exprHasAwait("spread" in p ? p.spread : p.value));
    default: return false;
  }
}

function hasAwait(stmts: Stmt[]): boolean {
  return stmts.some((s) => {
    if (s.kind === "ExprStmt") return exprHasAwait(s.expr);
    if (s.kind === "Let") return exprHasAwait(s.init);
    if (s.kind === "Return") return s.value !== null && exprHasAwait(s.value);
    if (s.kind === "Try") return hasAwait(s.body) || hasAwait(s.handler);
    if (s.kind === "Cleanup") return false;
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
