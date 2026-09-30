// Type checker: small type system, null safety and errors with fixes.
import type { ComponentDecl, Element, Expr, Loc, Program, Stmt, TypeRef, ViewNode } from "./ast.ts";
import { ELEMENTS, ENUM_PROPS } from "./elements.ts";
import { CATALOG, diag, suggest, type Diagnostic } from "./errors.ts";
import { printExpr } from "./printer.ts";

export type Ty =
  | { k: "num" } | { k: "str" } | { k: "bool" } | { k: "null" } | { k: "any" } | { k: "void" }
  | { k: "list"; of: Ty }
  | { k: "opt"; of: Ty }
  | { k: "model"; name: string }
  | { k: "obj"; fields: Record<string, Ty> }
  | { k: "fn"; ret: Ty };

const NUM: Ty = { k: "num" }, STR: Ty = { k: "str" }, BOOL: Ty = { k: "bool" }, NULL: Ty = { k: "null" }, ANY: Ty = { k: "any" };
const fn = (ret: Ty): Ty => ({ k: "fn", ret });
const list = (of: Ty): Ty => ({ k: "list", of });
const opt = (of: Ty): Ty => (of.k === "opt" || of.k === "any" || of.k === "null" ? of : { k: "opt", of });

// Built-in types. ID and Email are strings with semantics (validation to come).
export const BUILTIN_TYPES: Record<string, Ty> = { String: STR, Number: NUM, Bool: BOOL, ID: STR, Email: STR, Date: ANY, Fn: fn(ANY), Any: ANY };

export const GLOBALS = new Set([
  "Math", "JSON", "console", "Date", "Number", "String", "Boolean", "Array", "Object", "Map", "Set", "Promise", "Intl",
  "window", "document", "fetch", "localStorage", "sessionStorage", "crypto", "navigator", "location",
  "parseInt", "parseFloat", "isNaN", "alert", "confirm", "prompt", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "encodeURIComponent", "decodeURIComponent", "structuredClone", "Infinity", "NaN",
]);

export function show(t: Ty): string {
  switch (t.k) {
    case "num": return "Number";
    case "str": return "String";
    case "bool": return "Bool";
    case "null": return "null";
    case "any": return "Any";
    case "void": return "Void";
    case "list": return show(t.of) + "[]";
    case "opt": return show(t.of) + "?";
    case "model": return t.name;
    case "obj": return "{ " + Object.entries(t.fields).map(([k, v]) => `${k}: ${show(v)}`).join(", ") + " }";
    case "fn": return "Fn";
  }
}

// Most common list and string methods, with their return types.
function listMethod(name: string, elem: Ty, self: Ty): Ty | null {
  switch (name) {
    case "length": return NUM;
    case "map": case "flatMap": return fn(list(ANY));
    case "filter": case "slice": case "concat": case "toSorted": case "toReversed": case "sort": case "reverse": return fn(self);
    case "find": case "at": case "pop": case "shift": case "findLast": return fn(opt(elem));
    case "some": case "every": case "includes": return fn(BOOL);
    case "indexOf": case "findIndex": case "push": case "unshift": return fn(NUM);
    case "join": return fn(STR);
    case "forEach": return fn({ k: "void" });
    case "reduce": case "splice": return fn(ANY);
  }
  return null;
}

function strMethod(name: string): Ty | null {
  if (name === "length") return NUM;
  if (["includes", "startsWith", "endsWith"].includes(name)) return fn(BOOL);
  if (["indexOf", "lastIndexOf"].includes(name)) return fn(NUM);
  if (name === "split") return fn(list(STR));
  if (["toUpperCase", "toLowerCase", "trim", "trimStart", "trimEnd", "slice", "substring", "replace", "replaceAll", "padStart", "padEnd", "repeat", "at", "charAt"].includes(name)) return fn(STR);
  return null;
}

export type SymKind = "state" | "computed" | "prop" | "fn" | "let" | "loop" | "param" | "global";
export type Sym = { kind: SymKind; ty: Ty };

class Scope {
  vars = new Map<string, Sym>();
  parent: Scope | null;
  constructor(parent: Scope | null) {
    this.parent = parent;
  }
  get(name: string): Sym | undefined {
    return this.vars.get(name) ?? this.parent?.get(name);
  }
  names(): string[] {
    return [...this.vars.keys(), ...(this.parent?.names() ?? [])];
  }
}

export type ModelInfo = Map<string, Record<string, Ty>>;
export type CompInfo = Map<string, { params: { name: string; ty: Ty; required: boolean }[] }>;

export type Analysis = { diagnostics: Diagnostic[]; models: ModelInfo; comps: CompInfo; symbols: Map<string, Map<string, Sym>> };

export function analyze(program: Program): Analysis {
  const c = new Checker(program);
  const diagnostics = c.run();
  return { diagnostics, models: c.models, comps: c.comps, symbols: c.symbols };
}

export function check(program: Program): Diagnostic[] {
  return analyze(program).diagnostics;
}

class Checker {
  program: Program;
  diags: Diagnostic[] = [];
  models: ModelInfo = new Map();
  comps: CompInfo = new Map();
  at = "";
  types = new WeakMap<Expr, Ty>(); // inferred type of every expression
  symbols = new Map<string, Map<string, Sym>>(); // component-level symbols, for `art context`
  constructor(program: Program) {
    this.program = program;
  }

  err(type: keyof typeof CATALOG, msg: string, loc: Loc, extra: Partial<Diagnostic> = {}) {
    this.diags.push(diag(type, msg, loc, { at: this.at || undefined, ...extra }));
  }

  run(): Diagnostic[] {
    const seen = new Set<string>();
    for (const d of this.program.decls) {
      if (seen.has(d.name)) this.err("DUPLICATE_NAME", `'${d.name}' ya está declarado`, d.loc, { expr: d.name });
      seen.add(d.name);
      if (d.kind === "Model") this.models.set(d.name, {});
    }
    for (const d of this.program.decls) {
      if (d.kind !== "Model") continue;
      this.at = d.name;
      const fields = this.models.get(d.name)!;
      for (const f of d.fields) {
        if (f.name in fields) this.err("DUPLICATE_NAME", `campo '${f.name}' repetido`, f.loc, { expr: f.name });
        fields[f.name] = this.resolve(f.type);
      }
    }
    for (const d of this.program.decls) {
      if (d.kind !== "Component") continue;
      this.at = d.name;
      this.comps.set(d.name, {
        params: d.params.map((p) => ({ name: p.name, ty: this.resolve(p.type), required: !p.default && !p.type.optional })),
      });
    }
    for (const d of this.program.decls) if (d.kind === "Component") this.component(d);
    return this.diags;
  }

  resolve(t: TypeRef): Ty {
    let ty: Ty = BUILTIN_TYPES[t.name] ?? (this.models.has(t.name) ? { k: "model", name: t.name } : ANY);
    if (!BUILTIN_TYPES[t.name] && !this.models.has(t.name)) {
      this.err("UNKNOWN_TYPE", `tipo desconocido '${t.name}'`, t.loc, {
        expr: t.name, fixes: suggest(t.name, [...Object.keys(BUILTIN_TYPES), ...this.models.keys()]),
      });
    }
    if (t.list) ty = list(ty);
    if (t.optional) ty = opt(ty);
    return ty;
  }

  // ---------- components ----------
  component(c: ComponentDecl) {
    this.at = c.name;
    const scope = new Scope(null);
    const declare = (name: string, sym: Sym, loc: Loc) => {
      if (scope.vars.has(name)) this.err("DUPLICATE_NAME", `'${name}' ya está declarado en ${c.name}`, loc, { expr: name });
      scope.vars.set(name, sym);
    };
    for (const p of c.params) {
      declare(p.name, { kind: "prop", ty: this.resolve(p.type) }, p.loc);
      if (p.default) this.expectTy(p.default, this.infer(p.default, scope), scope.get(p.name)!.ty);
    }
    // Declare everything first (allows forward references), then infer types in order.
    for (const m of c.members) declare(m.name, { kind: m.kind === "State" ? "state" : m.kind === "Computed" ? "computed" : "fn", ty: m.kind === "Fn" ? fn(ANY) : ANY }, m.loc);
    for (const m of c.members) {
      const sym = scope.vars.get(m.name)!;
      if (m.kind === "State") {
        const init = this.infer(m.init, scope);
        if (m.type) {
          sym.ty = this.resolve(m.type);
          this.expectTy(m.init, init, sym.ty);
        } else sym.ty = init.k === "null" ? ANY : init;
      } else if (m.kind === "Computed") {
        sym.ty = this.infer(m.expr, scope);
      } else {
        const fs = new Scope(scope);
        for (const p of m.params) fs.vars.set(p, { kind: "param", ty: ANY });
        this.stmts(m.body, fs);
      }
    }
    this.symbols.set(c.name, scope.vars);
    this.view(c.view, scope);
  }

  view(nodes: ViewNode[], scope: Scope) {
    for (const n of nodes) {
      if (n.kind === "IfView") {
        this.infer(n.cond, scope);
        this.view(n.then, scope);
        if (n.else) this.view(n.else, scope);
      } else if (n.kind === "ForView") {
        let lt = this.infer(n.list, scope);
        if (lt.k === "opt") {
          this.err("POSSIBLY_EMPTY", "la lista puede ser null", n.list.loc, {
            expr: printExpr(n.list), expected: show(lt.of), actual: show(lt), fixes: [`${printExpr(n.list)} ?? []`],
          });
          lt = lt.of;
        }
        let elem: Ty = ANY;
        if (lt.k === "list") elem = lt.of;
        else if (lt.k !== "any") this.err("NOT_A_LIST", "`for` necesita una lista", n.list.loc, { expr: printExpr(n.list), expected: "T[]", actual: show(lt) });
        const s = new Scope(scope);
        s.vars.set(n.item, { kind: "loop", ty: elem });
        if (n.index) s.vars.set(n.index, { kind: "loop", ty: NUM });
        this.view(n.body, s);
      } else this.element(n, scope);
    }
  }

  element(el: Element, scope: Scope) {
    if (/^[A-Z]/.test(el.tag)) return this.componentUse(el, scope);
    const spec = ELEMENTS[el.tag];
    if (!spec) {
      this.err("UNKNOWN_ELEMENT", `elemento desconocido '${el.tag}'`, el.loc, {
        expr: el.tag, fixes: suggest(el.tag, [...Object.keys(ELEMENTS), ...this.comps.keys()]),
      });
      return;
    }
    if (el.content) {
      if (spec.content === "bind") {
        if (!this.bindable(el.content, scope)) {
          this.err("NOT_BINDABLE", "`input` enlaza su valor a un state", el.content.loc, {
            expr: printExpr(el.content), fixes: ["declarar `state x = \"\"` y usar `input x`"],
          });
        }
      }
      this.infer(el.content, scope);
    }
    for (const p of el.props) {
      if (p.value === null) {
        if (!spec.flags.includes(p.name)) {
          this.err("UNKNOWN_PROP", `'${el.tag}' no acepta el flag '${p.name}'`, p.loc, {
            expr: p.name, expected: spec.flags.join("|") || "ningún flag", fixes: suggest(p.name, spec.flags),
          });
        }
        continue;
      }
      // Conditional flag: `text title muted=todo.done` applies the flag while the value is true.
      if (spec.flags.includes(p.name)) {
        this.expectTy(p.value, this.infer(p.value, scope), BOOL);
        continue;
      }
      if (!spec.props.includes(p.name)) {
        this.err("UNKNOWN_PROP", `'${el.tag}' no acepta la prop '${p.name}'`, p.loc, {
          expr: p.name, expected: spec.props.join("|"), fixes: suggest(p.name, [...spec.props, ...spec.flags]),
        });
        continue;
      }
      const values = ENUM_PROPS[p.name];
      if (values) {
        const v = p.value.kind === "Ident" ? p.value.name : p.value.kind === "Str" ? p.value.value : null;
        if (v !== null && !values.includes(v) && !(p.value.kind === "Ident" && scope.get(v))) {
          this.err("TYPE_MISMATCH", `valor inválido para '${p.name}'`, p.value.loc, { expr: v, expected: values.join("|"), fixes: suggest(v, values) });
          continue;
        }
        if (v !== null && values.includes(v)) continue;
      }
      this.infer(p.value, scope);
    }
    if (el.action) {
      if (!spec.action) this.err("NO_ACTION", `'${el.tag}' no acepta acción '->'`, el.loc, { expr: el.tag, fixes: ["usar `button \"...\" -> accion`"] });
      this.stmts(el.action, new Scope(scope));
    }
    if (el.children.length) {
      if (!spec.children) this.err("NO_CHILDREN", `'${el.tag}' no acepta hijos`, el.loc, { expr: el.tag, fixes: ["envolverlo en `row`, `column` o `card`"] });
      this.view(el.children, scope);
    }
  }

  componentUse(el: Element, scope: Scope) {
    const comp = this.comps.get(el.tag);
    if (!comp) {
      this.err("UNKNOWN_ELEMENT", `componente desconocido '${el.tag}'`, el.loc, { expr: el.tag, fixes: suggest(el.tag, this.comps.keys()) });
      return;
    }
    const given = new Set<string>();
    for (const p of el.props) {
      const param = comp.params.find((x) => x.name === p.name);
      if (!param || p.value === null) {
        this.err("UNKNOWN_PROP", `'${el.tag}' no tiene la prop '${p.name}'`, p.loc, {
          expr: p.name, expected: comp.params.map((x) => x.name).join("|") || "sin props", fixes: suggest(p.name, comp.params.map((x) => x.name)),
        });
        continue;
      }
      given.add(p.name);
      this.expectTy(p.value, this.infer(p.value, scope), param.ty);
    }
    for (const p of comp.params) {
      if (p.required && !given.has(p.name)) {
        this.err("MISSING_PROP", `falta la prop '${p.name}' de ${el.tag}`, el.loc, { expr: el.tag, expected: `${p.name}: ${show(p.ty)}`, fixes: [`${el.tag} ${p.name}=...`] });
      }
    }
    if (el.action) this.err("NO_ACTION", `un componente no acepta '->'`, el.loc, { expr: el.tag });
    if (el.children.length) this.err("NO_CHILDREN", `'${el.tag}' no acepta hijos`, el.loc, { expr: el.tag });
  }

  // ---------- statements ----------
  stmts(list: Stmt[], scope: Scope) {
    for (const s of list) {
      if (s.kind === "ExprStmt") this.infer(s.expr, scope);
      else if (s.kind === "Let") scope.vars.set(s.name, { kind: "let", ty: this.infer(s.init, scope) });
      else if (s.kind === "Return") { if (s.value) this.infer(s.value, scope); }
      else {
        this.infer(s.cond, scope);
        this.stmts(s.then, new Scope(scope));
        if (s.else) this.stmts(s.else, new Scope(scope));
      }
    }
  }

  // ---------- expressions ----------
  rootIdent(e: Expr): Expr & { kind: "Ident" } | null {
    while (e.kind === "Member" || e.kind === "Index") e = e.object;
    return e.kind === "Ident" ? e : null;
  }

  bindable(e: Expr, scope: Scope): boolean {
    const root = this.rootIdent(e);
    if (!root) return false;
    const sym = scope.get(root.name);
    if (!sym) return true; // already reported as UNDEFINED_NAME
    return sym.kind === "state" || (e.kind !== "Ident" && (sym.kind === "loop" || sym.kind === "prop"));
  }

  // Validates an assignment target and returns its type.
  target(t: Expr, scope: Scope): Ty {
    const root = this.rootIdent(t);
    if (!root) {
      this.err("ASSIGN_READONLY", "no se puede asignar a esta expresión", t.loc, { expr: printExpr(t) });
      return ANY;
    }
    const sym = scope.get(root.name);
    const ty = this.infer(t, scope);
    if (!sym) return ty;
    const direct = t.kind === "Ident";
    const ok = sym.kind === "state" || sym.kind === "let" || sym.kind === "global" || (!direct && (sym.kind === "loop" || sym.kind === "param" || sym.kind === "prop"));
    if (!ok) {
      const fixes = sym.kind === "computed" ? [`cambiar \`computed ${root.name}\` por \`state ${root.name}\``] : sym.kind === "prop" ? ["pasar un callback como prop o usar un state local"] : [];
      this.err("ASSIGN_READONLY", `'${root.name}' es ${sym.kind} y no se puede modificar`, t.loc, { expr: printExpr(t), actual: sym.kind, expected: "state|let", fixes });
    }
    return ty;
  }

  // Checks that `actual` is assignable to `expected`; reports the most specific error possible.
  expectTy(e: Expr, actual: Ty, expected: Ty) {
    const inner = expected.k === "opt" ? expected.of : expected;
    if (inner.k === "model" && e.kind === "Object") return this.modelLiteral(e, inner.name);
    if (inner.k === "list" && e.kind === "Array") {
      for (const it of e.items) if (it.kind !== "Spread") this.expectTy(it, this.types.get(it) ?? ANY, inner.of);
      return;
    }
    if (this.assignable(actual, expected)) return;
    if (actual.k === "opt" && this.assignable(actual.of, expected)) {
      this.err("POSSIBLY_EMPTY", "el valor puede ser null", e.loc, {
        expr: printExpr(e), expected: show(expected), actual: show(actual), fixes: [`${printExpr(e)} ?? <valor por defecto>`],
      });
      return;
    }
    this.err("TYPE_MISMATCH", `se esperaba ${show(expected)}`, e.loc, { expr: printExpr(e), expected: show(expected), actual: show(actual) });
  }

  modelLiteral(e: Expr & { kind: "Object" }, model: string) {
    const fields = this.models.get(model)!;
    const given = new Set<string>();
    for (const p of e.props) {
      if ("spread" in p) return; // completeness can't be verified with a spread
      given.add(p.key);
      if (!(p.key in fields)) {
        this.err("UNKNOWN_FIELD", `${model} no tiene el campo '${p.key}'`, p.value.loc, { expr: p.key, expected: Object.keys(fields).join("|"), fixes: suggest(p.key, Object.keys(fields)) });
      } else this.expectTy(p.value, this.types.get(p.value) ?? ANY, fields[p.key]);
    }
    const missing = Object.entries(fields).filter(([k, t]) => !given.has(k) && t.k !== "opt");
    if (missing.length) {
      this.err("MISSING_FIELD", `faltan campos de ${model}: ${missing.map((m) => m[0]).join(", ")}`, e.loc, {
        expr: printExpr(e), expected: missing.map(([k, t]) => `${k}: ${show(t)}`).join(", "),
      });
    }
  }

  assignable(src: Ty, dst: Ty): boolean {
    if (src.k === "any" || dst.k === "any") return true;
    if (dst.k === "opt") return src.k === "null" || this.assignable(src.k === "opt" ? src.of : src, dst.of);
    if (src.k === "opt" || src.k === "null") return false;
    if (dst.k === "list") return src.k === "list" && this.assignable(src.of, dst.of);
    if (dst.k === "model") return (src.k === "model" && src.name === dst.name) || src.k === "obj";
    if (dst.k === "obj") return src.k === "obj" || src.k === "model";
    if (dst.k === "fn") return src.k === "fn";
    return src.k === dst.k;
  }

  infer(e: Expr, scope: Scope): Ty {
    const t = this.infer0(e, scope);
    this.types.set(e, t);
    return t;
  }

  infer0(e: Expr, scope: Scope): Ty {
    switch (e.kind) {
      case "Num": return NUM;
      case "Str": case "Template":
        if (e.kind === "Template") for (const x of e.exprs) this.infer(x, scope);
        return STR;
      case "Bool": return BOOL;
      case "Null": return NULL;
      case "Ident": {
        const sym = scope.get(e.name);
        if (sym) return sym.ty;
        if (GLOBALS.has(e.name)) return ANY;
        this.err("UNDEFINED_NAME", `'${e.name}' no está definido`, e.loc, { expr: e.name, fixes: suggest(e.name, scope.names()) });
        return ANY;
      }
      case "Member": {
        let t = this.infer(e.object, scope);
        let wrapOpt = false;
        if (t.k === "opt") {
          if (!e.optional) {
            this.err("POSSIBLY_EMPTY", "el valor puede ser null", e.loc, {
              expr: printExpr(e), expected: show(t.of), actual: show(t), fixes: [printExpr({ ...e, optional: true })],
            });
          }
          t = t.of;
          wrapOpt = true;
        }
        const r = this.memberTy(t, e.prop, e);
        return wrapOpt ? opt(r) : r;
      }
      case "Index": {
        const t = this.infer(e.object, scope);
        this.infer(e.index, scope);
        const base = t.k === "opt" ? t.of : t;
        if (t.k === "opt" && !e.optional) {
          this.err("POSSIBLY_EMPTY", "el valor puede ser null", e.loc, { expr: printExpr(e), actual: show(t), fixes: [printExpr({ ...e, optional: true })] });
        }
        if (base.k === "list") return opt(base.of);
        if (base.k === "str") return STR;
        return ANY;
      }
      case "Call": {
        const t = this.infer(e.callee, scope);
        const argTys = e.args.map((a) => this.infer(a, scope));
        // push/unshift on lists of models: validate the object against the model.
        if (e.callee.kind === "Member" && (e.callee.prop === "push" || e.callee.prop === "unshift")) {
          const lt = this.types.get(e.callee.object) ?? ANY;
          if (lt.k === "list") e.args.forEach((a, i) => this.expectTy(a, argTys[i], lt.of));
        }
        const base = t.k === "opt" ? t.of : t;
        if (base.k === "fn") return e.optional || t.k === "opt" ? opt(base.ret) : base.ret;
        return ANY;
      }
      case "Unary": {
        const t = this.infer(e.arg, scope);
        if (e.op === "!") return BOOL;
        if (e.op === "typeof") return STR;
        if (t.k !== "num" && t.k !== "any") this.err("TYPE_MISMATCH", `'${e.op}' necesita un número`, e.loc, { expr: printExpr(e), expected: "Number", actual: show(t) });
        return NUM;
      }
      case "Update": {
        const t = this.target(e.arg, scope);
        if (t.k !== "num" && t.k !== "any") this.err("TYPE_MISMATCH", `'${e.op}' necesita un número`, e.loc, { expr: printExpr(e), expected: "Number", actual: show(t) });
        return NUM;
      }
      case "Binary": return this.binary(e, scope);
      case "Cond": {
        this.infer(e.test, scope);
        const a = this.infer(e.then, scope), b = this.infer(e.else, scope);
        if (a.k === "null") return opt(b);
        if (b.k === "null") return opt(a);
        return this.assignable(a, b) && this.assignable(b, a) ? a : ANY;
      }
      case "Assign": {
        const tt = this.target(e.target, scope);
        const vt = this.infer(e.value, scope);
        if (e.op === "=") this.expectTy(e.value, vt, tt);
        else if (e.op !== "??=" && !(tt.k === "num" || tt.k === "any" || (e.op === "+=" && tt.k === "str"))) {
          this.err("TYPE_MISMATCH", `'${e.op}' necesita un número`, e.loc, { expr: printExpr(e), expected: "Number", actual: show(tt) });
        }
        return tt;
      }
      case "Array": {
        const tys = e.items.map((x) => this.infer(x, scope));
        if (!tys.length || e.items.some((x) => x.kind === "Spread")) return list(ANY);
        return tys.every((t) => show(t) === show(tys[0])) ? list(tys[0]) : list(ANY);
      }
      case "Object": {
        const fields: Record<string, Ty> = {};
        for (const p of e.props) {
          if ("spread" in p) this.infer(p.spread, scope);
          else fields[p.key] = this.infer(p.value, scope);
        }
        return { k: "obj", fields };
      }
      case "Arrow": {
        const s = new Scope(scope);
        for (const p of e.params) s.vars.set(p, { kind: "param", ty: ANY });
        if (Array.isArray(e.body)) { this.stmts(e.body, s); return fn(ANY); }
        return fn(this.infer(e.body, s));
      }
      case "Spread": this.infer(e.arg, scope); return ANY;
    }
  }

  memberTy(t: Ty, prop: string, e: Expr): Ty {
    if (t.k === "model") {
      const fields = this.models.get(t.name)!;
      if (prop in fields) return fields[prop];
      this.err("UNKNOWN_FIELD", `${t.name} no tiene el campo '${prop}'`, e.loc, { expr: printExpr(e), expected: Object.keys(fields).join("|"), fixes: suggest(prop, Object.keys(fields)) });
      return ANY;
    }
    if (t.k === "obj") return t.fields[prop] ?? ANY;
    if (t.k === "list") return listMethod(prop, t.of, t) ?? ANY;
    if (t.k === "str") return strMethod(prop) ?? ANY;
    if (t.k === "num" && (prop === "toFixed" || prop === "toString")) return fn(STR);
    return ANY;
  }

  binary(e: Expr & { kind: "Binary" }, scope: Scope): Ty {
    const l = this.infer(e.left, scope), r = this.infer(e.right, scope);
    switch (e.op) {
      case "+":
        if (l.k === "str" || r.k === "str") return STR;
        if (l.k === "num" && r.k === "num") return NUM;
        return ANY;
      case "-": case "*": case "/": case "%": case "**":
        for (const [side, t] of [[e.left, l], [e.right, r]] as const) {
          if (t.k !== "num" && t.k !== "any") this.err("TYPE_MISMATCH", `'${e.op}' necesita números`, side.loc, { expr: printExpr(side), expected: "Number", actual: show(t) });
        }
        return NUM;
      case "==": case "!=": case "<": case ">": case "<=": case ">=": return BOOL;
      case "&&": return r;
      case "||": return l.k === "opt" ? (this.assignable(r, l.of) ? l.of : ANY) : show(l) === show(r) ? l : ANY;
      case "??": return l.k === "opt" ? (this.assignable(r, l.of) ? l.of : ANY) : l;
    }
    return ANY;
  }
}
