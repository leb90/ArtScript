// Generates an ES module that builds the DOM directly (no virtual DOM) using runtime.js.
import type { ApiAccess, ComponentDecl, Element, Expr, Program, ServerFnDecl, Stmt, ViewNode } from "./ast.ts";
import { printType } from "./printer.ts";
import { ELEMENTS, ENUM_PROPS, SPACING_PROPS } from "./elements.ts";

type Kind = "state" | "computed" | "prop" | "fn" | "let" | "loop" | "param";
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

export function generate(program: Program): string {
  const out: string[] = ['import * as $ from "./runtime.js";', ""];
  const apis = program.decls.filter((d) => d.kind === "Api");
  // Typed REST client: one entry per `api` declaration.
  if (apis.length) out.push(`const api = { ${apis.map((a) => `${a.name}: $.$api(${JSON.stringify(a.name)})`).join(", ")} };`, "");
  if (program.decls.some((d) => d.kind === "Auth")) out.push("const auth = $.$auth();", "");
  if (program.decls.some((d) => d.kind === "ServerFn")) out.push("const server = $.$server();", "");
  const pages: string[] = [];
  for (const d of program.decls) {
    if (d.kind !== "Component") continue;
    out.push(new ComponentGen(d).gen(), "");
    if (d.page) pages.push(`{ path: ${JSON.stringify(d.path ?? "/" + d.name.toLowerCase())}, comp: ${d.name} }`);
  }
  out.push(`export const routes = [${pages.join(", ")}];`);
  out.push("export const start = (el) => $.start(routes, el);", "");
  return out.join("\n");
}

// What the server runtime needs: field types per model, each api's model and access, the auth api,
// and the compiled `server fn`s (an ES module exporting `fns`).
export type ServerSchema = {
  models: Record<string, Record<string, string>>;
  apis: Record<string, { model: string; access: ApiAccess }>;
  auth: string | null;
  fns: string;
};

export function serverSchema(program: Program): ServerSchema | null {
  const apis: ServerSchema["apis"] = {};
  const models: ServerSchema["models"] = {};
  let auth: string | null = null;
  for (const d of program.decls) {
    if (d.kind === "Api") apis[d.name] = { model: d.model, access: d.access };
    if (d.kind === "Model") models[d.name] = Object.fromEntries(d.fields.map((f) => [f.name, printType(f.type)]));
    if (d.kind === "Auth") auth = d.api;
  }
  const fns = program.decls.filter((d) => d.kind === "ServerFn");
  if (!Object.keys(apis).length && !fns.length) return null;
  return { models, apis, auth, fns: serverFnsModule(fns) };
}

// Each server fn becomes `async name({ db, me, fail }, ...params)`.
function serverFnsModule(fns: ServerFnDecl[]): string {
  const host: ComponentDecl = { kind: "Component", page: false, name: "server", path: null, params: [], members: [], view: [], loc: { file: "", line: 0, col: 0 } };
  const out = ["export const fns = {"];
  for (const f of fns) {
    const g = new ComponentGen(host);
    g.ind = 2;
    const scope = new Scope(null);
    for (const name of ["db", "me", "fail", ...f.params]) scope.vars.set(name, { kind: "param" });
    g.stmts(f.body, scope);
    out.push(`  async ${f.name}({ db, me, fail }${f.params.map((p) => `, ${p}`).join("")}) {`, ...g.lines, "  },");
  }
  out.push("};");
  return out.join("\n");
}

export function serverEntry(schema: ServerSchema): string {
  const { fns, ...rest } = schema;
  return `import { serve } from "./server-runtime.js";\n\n${fns}\n\nserve(${JSON.stringify(rest)}, fns, new URL(".", import.meta.url));\n`;
}

export function htmlShell(title = "ArtScript"): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><div id="app"></div><script type="module">import{start}from"./app.js";start()</script></body></html>\n`;
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
    // `data` compiles to a signal, so it reads and mutates like a state.
    for (const m of c.members) scope.vars.set(m.name, { kind: m.kind === "Computed" ? "computed" : m.kind === "Fn" ? "fn" : "state" });
    for (const p of c.params) {
      const def = p.default ? `(() => ${this.expr(p.default, scope)})` : "(() => undefined)";
      this.emit(`const ${p.name} = $p.${p.name} ?? ${def};`);
    }
    for (const m of c.members) {
      if (m.kind === "State") this.emit(`const ${m.name} = $.signal(${this.expr(m.init, scope)});`);
      else if (m.kind === "Computed") this.emit(`const ${m.name} = $.computed(() => ${this.expr(m.expr, scope)});`);
      else if (m.kind === "Data") {
        // Lists start as [] so views can iterate right away; anything else starts as null.
        const isList = m.expr.kind === "Call" && m.expr.callee.kind === "Member" && m.expr.callee.prop === "list";
        this.emit(`const ${m.name} = $.$data(() => ${this.expr(m.expr, scope)}, ${isList ? "[]" : "null"});`);
      } else {
        const fs = scope.child();
        for (const p of m.params) fs.vars.set(p, { kind: "param" });
        this.emit(`${hasAwait(m.body) ? "async " : ""}function ${m.name}(${m.params.join(", ")}) {`);
        this.ind++;
        this.stmts(m.body, fs);
        this.ind--;
        this.emit("}");
      }
    }
    this.view(c.view, "$parent", scope);
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
        this.emit(`$.$for(${parent}, () => ${this.expr(node.list, scope)}, (${params}) => {`);
        this.nested(() => this.view(node.body, f, s));
        this.emit("});");
      } else if (/^[A-Z]/.test(node.tag)) {
        // If the prop comes from a state, pass its signal so the child can notify mutations.
        const props = node.props.filter((p) => p.value).map((p) => {
          const get = `() => ${this.expr(p.value!, scope)}`;
          const sig = this.signalOf(p.value!, scope);
          return `${p.name}: ${sig ? `$.$ref(${get}, ${sig})` : get}`;
        });
        this.emit(`${node.tag}({ ${props.join(", ")} }, ${parent});`);
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
    const v = this.v();
    const classes = [spec.cls, ...el.props.filter((p) => !p.value).map((p) => "a-" + p.name)].filter(Boolean).join(" ");
    const isFlag = (name: string) => spec.flags.includes(name);
    this.emit(`const ${v} = $.$el(${parent}, "${spec.html}"${classes ? `, "${classes}"` : ""});`);

    const typeProp = el.props.find((p) => p.name === "type")?.value;
    const inputType = typeProp?.kind === "Ident" ? typeProp.name : typeProp?.kind === "Str" ? typeProp.value : null;

    for (const p of el.props) {
      if (!p.value) continue;
      const val = p.value;
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
      } else if (p.name === "to") {
        this.attr(v, "href", val, scope, (s) => `"#" + ${s}`);
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
        const mode = inputType === "checkbox" ? "checked" : inputType === "number" ? "number" : "value";
        this.emit(`$.$bind(${v}, () => ${this.expr(c, scope)}, ($v) => ${set}, "${mode}");`);
      }
    }

    if (el.action && spec.action) {
      this.emit(`$.$on(${v}, "${spec.action}", ${hasAwait(el.action) ? "async " : ""}() => {`);
      this.nested(() => this.stmts(el.action!, scope.child()));
      this.emit("});");
    }
    this.view(el.children, v, scope);
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
        scope.vars.set(s.name, { kind: "let" });
      } else if (s.kind === "Return") this.emit(s.value ? `return ${this.expr(s.value, scope)};` : "return;");
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
    if (sym?.kind === "state") return e.name;
    if (sym?.kind === "prop") return `${e.name}.sig`;
    return sym?.sig;
  }

  expr(e: Expr, scope: Scope): string {
    const x = (y: Expr) => this.expr(y, scope);
    switch (e.kind) {
      case "Num": return String(e.value);
      case "Str": return JSON.stringify(e.value);
      case "Template": return "`" + e.quasis.map((q, i) => q.replace(/[`\\$]/g, "\\$&") + (i < e.exprs.length ? "${" + x(e.exprs[i]) + "}" : "")).join("") + "`";
      case "Bool": return String(e.value);
      case "Null": return "null";
      case "Ident": {
        const sym = scope.get(e.name);
        if (sym?.kind === "state" || sym?.kind === "computed") return `${e.name}.v`;
        if (sym?.kind === "prop") return `${e.name}()`;
        return e.name;
      }
      case "Member": return `${this.wrapPostfix(e.object, scope)}${e.optional ? "?." : "."}${e.prop}`;
      case "Index": return `${this.wrapPostfix(e.object, scope)}${e.optional ? "?.[" : "["}${x(e.index)}]`;
      case "Call": {
        const call = `${this.wrapPostfix(e.callee, scope)}${e.optional ? "?.(" : "("}${e.args.map(x).join(", ")})`;
        if (e.callee.kind === "Member" && MUTATORS.has(e.callee.prop)) {
          const sig = this.signalOf(e.callee.object, scope);
          if (sig) return `$.$m(${sig}, ${call})`;
        }
        return call;
      }
      case "Unary": return e.op === "typeof" || e.op === "await" ? `(${e.op} ${x(e.arg)})` : `${e.op}(${x(e.arg)})`;
      case "Update": return this.mutation(e.arg, e.prefix ? `${e.op}${x(e.arg)}` : `${x(e.arg)}${e.op}`, scope);
      case "Binary": return `(${x(e.left)} ${JS_OPS[e.op] ?? e.op} ${x(e.right)})`;
      case "Cond": return `(${x(e.test)} ? ${x(e.then)} : ${x(e.else)})`;
      case "Assign": return this.mutation(e.target, `${x(e.target)} ${e.op} ${x(e.value)}`, scope);
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
    const sig = this.signalOf(target, scope);
    return sig ? `$.$m(${sig}, ${code})` : code;
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
    return exprHasAwait(s.cond) || hasAwait(s.then) || (s.else !== null && hasAwait(s.else));
  });
}

function literal(e: Expr): string | number | boolean | null {
  if (e.kind === "Str" || e.kind === "Num" || e.kind === "Bool") return e.value;
  return null;
}
