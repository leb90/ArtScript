// Type checker: small type system, null safety and errors with fixes.
import type { ComponentDecl, Element, Expr, Field, Loc, ModelDecl, Program, ServerFnDecl, Stmt, TestDecl, TypeRef, UseDecl, ViewNode } from "./ast.ts";
import { BREAKPOINTS, ELEMENTS, ENUM_PROPS, RESPONSIVE_PROPS } from "./elements.ts";
import { ICONS } from "./icons.ts";
import { CATALOG, diag, suggest, type Diagnostic } from "./errors.ts";
import { inspectModule, isLocal, packageName } from "./modules.ts";
import { printDecl, printExpr, printType } from "./printer.ts";

export type Ty =
  | { k: "num" } | { k: "str" } | { k: "bool" } | { k: "null" } | { k: "any" } | { k: "void" }
  | { k: "list"; of: Ty }
  | { k: "opt"; of: Ty }
  | { k: "model"; name: string }
  | { k: "obj"; fields: Record<string, Ty>; strict?: boolean } // strict: unknown fields are errors (e.g. route params)
  | { k: "fn"; ret: Ty; params?: Ty[] }
  | { k: "async"; of: Ty } // result of an api call; `await` or `data` unwraps it
  | { k: "api"; name: string; model: string; sync?: boolean } // `api.users` (client, async) or `db.users` (server, sync)
  | { k: "auth"; model: string }; // `auth`

const NUM: Ty = { k: "num" }, STR: Ty = { k: "str" }, BOOL: Ty = { k: "bool" }, NULL: Ty = { k: "null" }, ANY: Ty = { k: "any" };
const fn = (ret: Ty): Ty => ({ k: "fn", ret });
const list = (of: Ty): Ty => ({ k: "list", of });
const opt = (of: Ty): Ty => (of.k === "opt" || of.k === "any" || of.k === "null" ? of : { k: "opt", of });

// Built-in types. ID and Email are strings with semantics (validation to come).
// An uploaded file, as stored and returned: `image post.photo.url`.
const FILE: Ty = { k: "obj", fields: { url: STR, name: STR, type: STR, size: NUM }, strict: true };
export const BUILTIN_TYPES: Record<string, Ty> = { String: STR, Number: NUM, Bool: BOOL, ID: STR, Email: STR, Date: ANY, Fn: fn(ANY), Any: ANY, File: FILE };

export const GLOBALS = new Set([
  "Math", "JSON", "console", "Date", "Number", "String", "Boolean", "Array", "Object", "Map", "Set", "Promise", "Intl",
  "window", "document", "fetch", "localStorage", "sessionStorage", "crypto", "navigator", "location",
  "parseInt", "parseFloat", "isNaN", "alert", "confirm", "prompt", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "encodeURIComponent", "decodeURIComponent", "structuredClone", "Infinity", "NaN",
  "URL", "URLSearchParams", "history", "Blob", "FormData", "TextEncoder", "TextDecoder", "AbortController",
  "requestAnimationFrame", "cancelAnimationFrame", "performance", "queueMicrotask", "RegExp", "Error", "BigInt", "Symbol",
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
    case "fn": return t.params ? `Fn(${t.params.map(show).join(", ")})` : "Fn";
    case "async": return `Async<${show(t.of)}>`;
    case "api": return `${t.sync ? "Db" : "Api"}<${t.model}>`;
    case "auth": return `Auth<${t.model}>`;
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

export type SymKind = "state" | "computed" | "data" | "prop" | "fn" | "let" | "loop" | "param" | "global" | "ref";
export type Sym = { kind: SymKind; ty: Ty };

class Scope {
  vars = new Map<string, Sym>();
  parent: Scope | null;
  constructor(parent: Scope | null) {
    this.parent = parent;
  }
  // Paths (`x`, `user.profile`) known to be non-null here, with their narrowed type.
  narrowed = new Map<string, Ty>();
  get(name: string): Sym | undefined {
    return this.vars.get(name) ?? this.parent?.get(name);
  }
  getNarrowed(path: string): Ty | undefined {
    return this.narrowed.get(path) ?? this.parent?.getNarrowed(path);
  }
  names(): string[] {
    return [...this.vars.keys(), ...(this.parent?.names() ?? [])];
  }
}

export type ModelInfo = Map<string, Record<string, Ty>>;
export type CompInfo = Map<string, { params: { name: string; ty: Ty; required: boolean }[]; slots: Set<string> }>;

// DOM events accepted by `on:<event>` (typos get the closest one).
const EVENTS = ["click", "dblclick", "input", "change", "submit", "keydown", "keyup", "focus", "blur", "mouseenter", "mouseleave", "mousedown", "mouseup", "mousemove", "pointerdown", "pointerup", "pointermove", "touchstart", "touchend", "wheel", "scroll", "contextmenu", "dragstart", "dragover", "dragleave", "drop", "paste", "copy", "load", "error", "ended", "play", "pause", "timeupdate", "toggle", "close"];

const OAUTH = ["google", "github"];

const DATA_STATE: Record<string, Ty> = { loading: BOOL, error: { k: "opt", of: STR }, reload: fn({ k: "void" }) };

export function isJsonLiteral(e: Expr): boolean {
  if (e.kind === "Str" || e.kind === "Num" || e.kind === "Bool" || e.kind === "Null") return true;
  if (e.kind === "Unary" && e.op === "-") return e.arg.kind === "Num";
  return e.kind === "Array" && e.items.length === 0;
}

function walkNodes(x: unknown, fn: (n: any) => void) {
  if (Array.isArray(x)) for (const y of x) walkNodes(y, fn);
  else if (x && typeof x === "object") {
    fn(x);
    for (const [k, v] of Object.entries(x)) if (k !== "loc") walkNodes(v, fn);
  }
}

// Props a component assigns (`items = items.filter(...)`), directly or by passing them on to a
// child that does: these are bound two-way, so the parent must pass something assignable.
export function twoWayProps(program: Program): Map<string, Set<string>> {
  const comps = program.decls.filter((d): d is ComponentDecl => d.kind === "Component");
  const out = new Map(comps.map((c) => [c.name, new Set<string>()]));
  const passes: [string, string, string, string][] = []; // [component, its prop, child, child prop]
  for (const c of comps) {
    const params = new Set(c.params.map((p) => p.name));
    walkNodes([c.members, c.view], (n) => {
      // Assigned, or bound by an input-like element (`input query`).
      const t = n.kind === "Assign" ? n.target : n.kind === "Update" ? n.arg : n.kind === "Element" && ELEMENTS[n.tag]?.content === "bind" ? n.content : null;
      if (t?.kind === "Ident" && params.has(t.name)) out.get(c.name)!.add(t.name);
      if (n.kind === "Element" && /^[A-Z]/.test(n.tag)) {
        for (const p of n.props) if (p.value?.kind === "Ident" && params.has(p.value.name)) passes.push([c.name, p.value.name, n.tag, p.name]);
      }
    });
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [c, p, child, q] of passes) {
      if (out.get(child)?.has(q) && !out.get(c)!.has(p)) { out.get(c)!.add(p); changed = true; }
    }
  }
  return out;
}

// The slots a component's view declares: "" for `slot`, the name for `slot header`.
export function slotNames(nodes: ViewNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind === "IfView") { slotNames(n.then, out); slotNames(n.else ?? [], out); }
    else if (n.kind === "ForView") slotNames(n.body, out);
    else if (n.tag === "slot") out.add(n.content?.kind === "Ident" ? n.content.name : "");
    else slotNames(n.children, out);
  }
  return out;
}

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
  apis = new Map<string, string>(); // api name → model name
  privateApis = new Set<string>(); // apis whose rows belong to a user (`owner` is set automatically)
  authModel: string | null = null; // model of the `auth` api
  serverFns = new Map<string, Ty>(); // server fn name → return type
  returns: Ty[] | null = null; // return types collected while checking a server fn
  imports = new Map<string, Ty>(); // names brought in by `use`, visible everywhere
  inLayout = false;
  inHook = false;
  twoWay = new Map<string, Set<string>>();
  arrowHint: Ty | null = null; // the callback type an arrow is being passed as
  layoutNow = false;
  oauth: string[] = []; // providers of `auth ... with`
  slots = 0;
  importFrom = new Map<string, string>(); // imported name → module
  idFields = new Map<string, Set<string>>(); // model → fields declared as ID (assigned by the server on create)
  constructor(program: Program) {
    this.program = program;
  }

  err(type: keyof typeof CATALOG, msg: string, loc: Loc, extra: Partial<Diagnostic> = {}) {
    this.diags.push(diag(type, msg, loc, { at: this.at || undefined, ...extra }));
  }

  run(): Diagnostic[] {
    const seen = new Set<string>();
    for (const d of this.program.decls) {
      if (d.kind === "Use") continue; // several files may use the same module
      if (seen.has(d.name)) this.err("DUPLICATE_NAME", `'${d.name}' is already declared`, d.loc, { expr: d.name });
      seen.add(d.name);
      if (d.kind === "Model") this.models.set(d.name, {});
    }
    for (const d of this.program.decls) {
      if (d.kind !== "Model") continue;
      this.at = d.name;
      const fields = this.models.get(d.name)!;
      for (const f of d.fields) {
        if (f.name in fields) this.err("DUPLICATE_NAME", `duplicate field '${f.name}'`, f.loc, { expr: f.name });
        fields[f.name] = this.resolve(f.type);
        this.rules(f, d.name);
        if (f.default) {
          if (!isJsonLiteral(f.default)) this.err("TYPE_MISMATCH", "a field default must be a literal", f.default.loc, { expr: printExpr(f.default), expected: '0, "", false, [] or null' });
          else this.expectTy(f.default, this.infer(f.default, new Scope(null)), fields[f.name]);
        }
      }
      this.idFields.set(d.name, new Set(d.fields.filter((f) => f.type.name === "ID" && !f.type.list).map((f) => f.name)));
    }
    for (const d of this.program.decls) {
      if (d.kind !== "Api") continue;
      this.at = d.name;
      if (!this.models.has(d.model)) {
        this.err("UNKNOWN_TYPE", `api '${d.name}' uses a model that doesn't exist: '${d.model}'`, d.modelLoc, { expr: d.model, fixes: suggest(d.model, this.models.keys()) });
      } else if (!this.idFields.get(d.model)?.size) {
        this.err("MISSING_FIELD", `api '${d.name}' needs ${d.model} to have an ID field`, d.modelLoc, { expr: d.model, expected: "id: ID", fixes: [`add \`id: ID\` to model ${d.model}`] });
      }
      this.apis.set(d.name, d.model);
      if (d.access === "private") {
        this.privateApis.add(d.name);
        if (this.models.has(d.model) && !this.idFields.get(d.model)?.has("owner")) {
          this.err("MISSING_FIELD", `private api '${d.name}' needs ${d.model} to have \`owner: ID\``, d.modelLoc, { expr: d.model, expected: "owner: ID", fixes: [`add \`owner: ID\` to model ${d.model}`] });
        }
      }
      if (d.access !== "public" && !this.program.decls.some((x) => x.kind === "Auth")) {
        this.err("AUTH_REQUIRED", `'${d.access}' needs accounts: \`auth <api>\` is missing`, d.loc, { expr: printDecl(d), fixes: ["auth users"] });
      }
    }
    for (const d of this.program.decls) {
      if (d.kind !== "Auth") continue;
      this.at = "auth";
      for (const p of d.providers ?? []) {
        if (!OAUTH.includes(p)) this.err("UNKNOWN_TYPE", `unknown sign-in provider '${p}'`, d.loc, { expr: p, expected: OAUTH.join("|"), fixes: suggest(p, OAUTH) });
      }
      this.oauth = d.providers ?? [];
      const model = this.apis.get(d.api);
      if (!model) {
        this.err("UNKNOWN_TYPE", `\`auth\` needs a users api: '${d.api}' doesn't exist`, d.loc, { expr: d.api, fixes: suggest(d.api, this.apis.keys()) });
        continue;
      }
      const decl = this.program.decls.find((x): x is ModelDecl => x.kind === "Model" && x.name === model);
      const typeOf = (f: string) => decl?.fields.find((x) => x.name === f)?.type.name;
      if (typeOf("email") !== "Email" || typeOf("password") !== "String") {
        this.err("MISSING_FIELD", `\`auth\` needs ${model} to have \`email: Email\` and \`password: String\``, d.loc, { expr: model, expected: "email: Email, password: String" });
      }
      this.authModel = model;
    }
    // `admin` apis need a role on the accounts model ("admin" | "user", set by the server).
    const roleOk = this.authModel !== null && this.program.decls.some((x) => x.kind === "Model" && x.name === this.authModel && x.fields.some((f) => f.name === "role" && f.type.name === "String"));
    for (const d of this.program.decls) {
      if (d.kind === "Api" && d.access === "admin" && this.authModel && !roleOk) {
        this.err("MISSING_FIELD", `'admin' needs ${this.authModel} to have \`role: String\``, d.loc, { expr: printDecl(d), expected: "role: String", fixes: [`add \`role: String\` to model ${this.authModel}`] });
      }
    }
    for (const d of this.program.decls) if (d.kind === "Use") this.use(d);
    for (const d of this.program.decls) if (d.kind === "ServerFn") this.serverFn(d);
    for (const d of this.program.decls) {
      if (d.kind !== "Component") continue;
      this.at = d.name;
      this.comps.set(d.name, {
        params: d.params.map((p) => ({ name: p.name, ty: this.resolve(p.type), required: !p.default && !p.type.optional })),
        slots: slotNames(d.view),
      });
    }
    this.routes();
    this.twoWay = twoWayProps(this.program);
    for (const d of this.program.decls) if (d.kind === "Component") this.component(d);
    for (const d of this.program.decls) if (d.kind === "Test") this.test(d);
    return this.diags;
  }

  // `"Total: {total}"` (Svelte/Vue habit) shows the braces as they are: suggest a template.
  braces(e: Expr & { kind: "Str" }, scope: Scope) {
    const m = /\{\s*([A-Za-z_$][\w$]*)[^{}]*\}/.exec(e.value);
    if (!m || !scope.get(m[1]) || scope.get(m[1])!.kind === "global") return;
    const tpl = "`" + e.value.replace(/\{([^{}]*)\}/g, "${$1}").replace(/`/g, "\\`") + "`";
    this.err("TEXT_BRACES", `'{${m[1]}...}' in a plain string is shown as is`, e.loc, { expr: JSON.stringify(e.value), expected: "a template", fixes: [tpl] });
  }

  // min/max: String, Email, Number or a list; match: String or Email; unique: a single value.
  rules(f: Field, model: string) {
    const r = f.rules;
    if (!r) return;
    const t = f.type;
    const text = !t.list && (t.name === "String" || t.name === "Email");
    const bad = (rule: string, expected: string) => this.err("TYPE_MISMATCH", `'${rule}' doesn't apply to ${printType(t)}`, f.loc, { expr: `${f.name}: ${printType(t)} ${rule}`, expected, actual: printType(t) });
    const file = t.name === "File";
    if (r.min !== undefined && file) bad("min", "String, Number or a list (a File takes max=bytes)");
    if ((r.min !== undefined || r.max !== undefined) && !(text || t.list || file || t.name === "Number")) bad("min/max", "String, Number, File or a list");
    if (r.accept !== undefined && !file) bad("accept", "File");
    if (r.min !== undefined && r.max !== undefined && r.min > r.max) this.err("TYPE_MISMATCH", `min (${r.min}) is greater than max (${r.max})`, f.loc, { expr: f.name });
    if (r.match !== undefined) {
      if (!text) bad("match", "String or Email");
      try { new RegExp(r.match); } catch (e) { this.err("TYPE_MISMATCH", `invalid regular expression: ${(e as Error).message}`, f.loc, { expr: r.match, expected: "a JavaScript regular expression" }); }
    }
    if (r.unique && (t.list || this.models.has(t.name))) bad("unique", "a single String, Email, Number or ID");
    if (r.cascade && !this.refTarget(model, f.name)) bad("cascade", "a field whose type is a model stored by an api, in a model stored by an api");
  }

  // Relations: in a model stored by an api, a field whose type is another stored model keeps its
  // id. Writes take the object or its id; reads return the referenced row.
  refTarget(model: string, field: string): string | null {
    const stored = (m: string) => this.program.decls.some((d) => d.kind === "Api" && d.model === m);
    const decl = this.program.decls.find((d): d is ModelDecl => d.kind === "Model" && d.name === model);
    const f = decl?.fields.find((x) => x.name === field);
    return f && stored(model) && stored(f.type.name) ? f.type.name : null;
  }

  resolve(t: TypeRef): Ty {
    let ty: Ty = BUILTIN_TYPES[t.name] ?? (this.models.has(t.name) ? { k: "model", name: t.name } : ANY);
    if (!BUILTIN_TYPES[t.name] && !this.models.has(t.name)) {
      this.err("UNKNOWN_TYPE", `unknown type '${t.name}'`, t.loc, {
        expr: t.name, fixes: suggest(t.name, [...Object.keys(BUILTIN_TYPES), ...this.models.keys()]),
      });
    }
    if (t.params) ty = { k: "fn", ret: ANY, params: t.params.map((p) => this.resolve(p)) };
    if (t.list) ty = list(ty);
    if (t.optional) ty = opt(ty);
    return ty;
  }

  // ---------- routes ----------
  // Page routes are "/static/:param" or "*"; each one once. A page's layout must exist.
  routes() {
    const seen = new Map<string, string>();
    const layouts = this.program.decls.filter((d): d is ComponentDecl => d.kind === "Component" && !!d.layout).map((d) => d.name);
    for (const d of this.program.decls) {
      if (d.kind !== "Component" || !d.page) continue;
      this.at = d.name;
      if (d.requires && !this.authModel) this.err("AUTH_REQUIRED", `'requires ${d.requires}' needs accounts: \`auth <api>\` is missing`, d.loc, { expr: `requires ${d.requires}`, fixes: ["auth users"] });
      const path = d.path ?? "/" + d.name.toLowerCase();
      if (path !== "*" && !/^\/[\w\-./:]*$/.test(path)) {
        this.err("BAD_ROUTE", `invalid route '${path}'`, d.loc, { expr: path, expected: '"/path", "/path/:param" or "*"' });
      }
      // Routes that differ only in param names are the same route.
      const shape = path.replace(/:\w+/g, ":");
      if (seen.has(shape)) this.err("BAD_ROUTE", `route '${path}' is also used by ${seen.get(shape)}`, d.loc, { expr: path });
      seen.set(shape, d.name);
      if (d.layoutName && !layouts.includes(d.layoutName)) {
        this.err("UNKNOWN_TYPE", `no layout named '${d.layoutName}'`, d.loc, { expr: d.layoutName, fixes: suggest(d.layoutName, layouts) });
      }
    }
    // A layout inside another: the outer one exists, and the chain doesn't loop.
    const byName = new Map(this.program.decls.flatMap((d) => (d.kind === "Component" && d.layout ? [[d.name, d] as const] : [])));
    for (const d of byName.values()) {
      if (!d.layoutName) continue;
      this.at = d.name;
      if (!byName.has(d.layoutName)) {
        this.err("UNKNOWN_TYPE", `no layout named '${d.layoutName}'`, d.loc, { expr: d.layoutName, fixes: suggest(d.layoutName, layouts.filter((n) => n !== d.name)) });
        continue;
      }
      const seen = [d.name];
      for (let n: string | undefined | null = d.layoutName; n; n = byName.get(n)?.layoutName) {
        if (seen.includes(n)) {
          this.err("LAYOUT_CYCLE", `layout ${d.name} ends up inside itself (${[...seen, n].join(" → ")})`, d.loc, { expr: `layout ${d.layoutName}`, fixes: [`remove \`layout ${d.layoutName}\` from layout ${d.name}`] });
          break;
        }
        seen.push(n);
      }
    }
  }

  // ---------- imports ----------
  // Checks a `use`: the module exists and exports what's imported. Imported values are typed Any.
  use(d: UseDecl) {
    this.at = d.name;
    const declared = new Set(this.program.decls.filter((x) => x.kind !== "Use").map((x) => x.name));
    for (const name of [...(d.default ? [d.default] : []), ...d.names]) {
      // The same name from the same module in several files is fine; from another module it clashes.
      const from = this.importFrom.get(name);
      if ((from !== undefined && from !== d.source) || declared.has(name)) this.err("DUPLICATE_NAME", `'${name}' is already declared`, d.loc, { expr: name });
      this.imports.set(name, ANY);
      this.importFrom.set(name, d.source);
    }
    const info = inspectModule(d.source, d.loc.file);
    if (!info) return; // no bundler available to inspect modules
    if (!info.found) {
      const fixes = isLocal(d.source) ? [`check the path (relative to ${d.loc.file})`] : [`npm install ${packageName(d.source)}`];
      this.err("UNKNOWN_MODULE", `module '${d.source}' not found`, d.loc, { expr: d.source, fixes });
      return;
    }
    if (d.default && !info.hasDefault) {
      const named = info.exports ?? [];
      this.err("UNKNOWN_EXPORT", `'${d.source}' has no default export`, d.loc, {
        expr: `as ${d.default}`, fixes: named.length ? [`use "${d.source}" { ${(suggest(d.default, named)[0] ?? named[0])} }`] : [],
      });
    }
    if (!info.exports) return; // CommonJS: names can't be known statically
    for (const local of d.names) {
      const name = d.renames?.[local] ?? local;
      if (!info.exports.includes(name)) {
        this.err("UNKNOWN_EXPORT", `'${d.source}' doesn't export '${name}'`, d.loc, { expr: name, fixes: suggest(name, info.exports) });
      }
    }
  }

  // Imported names are visible in every component and server fn.
  withImports(scope: Scope) {
    for (const [name, ty] of this.imports) scope.vars.set(name, { kind: "global", ty });
  }

  // ---------- server functions ----------
  // Run on the server with `db.<api>` (sync, unscoped), `me` (the logged-in user or null) and `fail(message)`.
  serverFn(d: ServerFnDecl) {
    this.at = d.name;
    const scope = new Scope(null);
    this.withImports(scope);
    const fields: Record<string, Ty> = {};
    for (const [name, model] of this.apis) fields[name] = { k: "api", name, model, sync: true };
    scope.vars.set("db", { kind: "global", ty: { k: "obj", fields } });
    if (this.authModel && !d.every) scope.vars.set("me", { kind: "let", ty: opt({ k: "model", name: this.authModel }) });
    if (d.every !== undefined && !/^\d+(s|m|h|d)$/.test(d.every)) {
      this.err("TYPE_MISMATCH", `invalid interval "${d.every}"`, d.loc, { expr: d.every, expected: '"30s", "5m", "1h" or "1d"' });
    }
    scope.vars.set("fail", { kind: "global", ty: fn({ k: "void" }) });
    scope.vars.set("email", { kind: "global", ty: fn({ k: "async", of: { k: "void" } }) }); // email(to, subject, text)
    // Node's globals: secrets come from `process.env`.
    for (const g of ["process", "Buffer"]) scope.vars.set(g, { kind: "global", ty: ANY });
    for (const p of d.params) scope.vars.set(p, { kind: "param", ty: ANY });
    this.returns = [];
    this.stmts(d.body, scope);
    const rs = this.returns.filter((t) => t.k !== "void");
    this.returns = null;
    if (d.every) return; // a job isn't callable from the client
    this.serverFns.set(d.name, !rs.length ? { k: "void" } : rs.every((t) => show(t) === show(rs[0])) ? rs[0] : ANY);
  }

  // ---------- tests ----------
  // Each step is a known command with literal arguments of the right type (see STEPS).
  test(d: TestDecl) {
    this.at = d.name;
    const STEPS: Record<string, string> = { open: "s?", see: "s", notSee: "s", click: "sn?", link: "sn?", fill: "ss", press: "ss", select: "ns", check: "n" };
    const usage: Record<string, string> = { open: 'open "/path"', see: 'see "text"', notSee: 'notSee "text"', click: 'click "Label" [n]', link: 'link "Label" [n]', fill: 'fill "Placeholder" "value"', press: 'press "Placeholder" "Enter"', select: 'select 0 "Option"', check: "check 0" };
    for (const s of d.body) {
      if (s.kind !== "ExprStmt" || s.expr.kind !== "Call" || s.expr.callee.kind !== "Ident") continue;
      const name = s.expr.callee.name, sig = STEPS[name], args = s.expr.args;
      if (!sig) {
        this.err("UNDEFINED_NAME", `unknown test step '${name}'`, s.loc, { expr: name, expected: Object.keys(STEPS).join("|"), fixes: suggest(name, Object.keys(STEPS)) });
        continue;
      }
      const kinds = sig.replace("?", "");
      const required = sig.endsWith("?") ? kinds.length - 1 : kinds.length;
      const ok = args.length >= required && args.length <= kinds.length && args.every((a, i) => (kinds[i] === "s" ? a.kind === "Str" : a.kind === "Num"));
      if (!ok) this.err("TYPE_MISMATCH", `'${name}' takes ${usage[name]}`, s.loc, { expr: name, expected: usage[name], actual: `${args.length} argument(s)`, fixes: [usage[name]] });
    }
  }

  // ---------- components ----------
  component(c: ComponentDecl) {
    this.at = c.name;
    const scope = new Scope(null);
    this.withImports(scope);
    scope.vars.set("navigate", { kind: "global", ty: fn({ k: "void" }) });
    scope.vars.set("notify", { kind: "global", ty: { k: "fn", ret: { k: "void" }, params: [STR, STR] } }); // notify("Saved", "success"?)
    scope.vars.set("setTheme", { kind: "global", ty: { k: "fn", ret: { k: "void" }, params: [STR] } }); // "dark" | "light" | "auto"
    scope.vars.set("theme", { kind: "global", ty: fn(STR) });
    // Pages get their route params (typed from the path) and the query string.
    if (c.page) {
      const keys = [...(c.path ?? "").matchAll(/:(\w+)/g)].map((m) => m[1]);
      if (keys.length) scope.vars.set("params", { kind: "global", ty: { k: "obj", fields: Object.fromEntries(keys.map((k) => [k, STR])), strict: true } });
      scope.vars.set("query", { kind: "global", ty: { k: "obj", fields: {} } });
    }
    this.inLayout = !c.page;
    this.layoutNow = !!c.layout;
    this.inHook = false;
    this.slots = 0;
    const declare = (name: string, sym: Sym, loc: Loc) => {
      // Globals (navigate, notify, api, auth...) can be shadowed by the component's own names.
      if (scope.vars.has(name) && scope.vars.get(name)!.kind !== "global") this.err("DUPLICATE_NAME", `'${name}' is already declared in ${c.name}`, loc, { expr: name });
      scope.vars.set(name, sym);
    };
    for (const p of c.params) {
      declare(p.name, { kind: "prop", ty: this.resolve(p.type) }, p.loc);
      if (p.default) this.expectTy(p.default, this.infer(p.default, scope), scope.get(p.name)!.ty);
    }
    // `api.<name>`, `auth` and `server.<fn>` are available in every component when declared.
    if (this.apis.size) {
      const fields: Record<string, Ty> = {};
      for (const [name, model] of this.apis) fields[name] = { k: "api", name, model };
      scope.vars.set("api", { kind: "global", ty: { k: "obj", fields } });
    }
    if (this.authModel) scope.vars.set("auth", { kind: "global", ty: { k: "auth", model: this.authModel } });
    if (this.serverFns.size) {
      const fields: Record<string, Ty> = {};
      for (const [name, ret] of this.serverFns) fields[name] = fn({ k: "async", of: ret });
      scope.vars.set("server", { kind: "global", ty: { k: "obj", fields } });
    }
    // Declare everything first (allows forward references), then infer types in order.
    const kindOf = { State: "state", Computed: "computed", Data: "data", Fn: "fn", Ref: "ref" } as const;
    for (const m of c.members) if (m.kind !== "Mount" && m.kind !== "Effect" && m.kind !== "Style") declare(m.name, { kind: kindOf[m.kind], ty: m.kind === "Fn" ? fn(ANY) : ANY }, m.loc);
    for (const m of c.members) {
      if (m.kind === "Ref" || m.kind === "Style") continue;
      if (m.kind === "Mount" || m.kind === "Effect") {
        this.inHook = true;
        this.stmts(m.body, new Scope(scope));
        this.inHook = false;
        continue;
      }
      const sym = scope.vars.get(m.name)!;
      if (m.kind === "State") {
        const init = this.infer(m.init, scope);
        if (m.type) {
          sym.ty = this.resolve(m.type);
          this.expectTy(m.init, init, sym.ty);
        } else sym.ty = init.k === "null" ? ANY : init;
      } else if (m.kind === "Computed") {
        sym.ty = this.infer(m.expr, scope);
      } else if (m.kind === "Data") {
        // Lists start as [] and objects as null until the request resolves.
        const t = this.infer(m.expr, scope);
        // count() starts at 0, so it isn't nullable either.
        if (t.k === "async") sym.ty = t.of.k === "list" || t.of.k === "num" ? t.of : opt(t.of);
        else if (t.k !== "any") this.err("TYPE_MISMATCH", "`data` needs an api call", m.expr.loc, { expr: printExpr(m.expr), expected: "api.<name>.list() | get(id)", actual: show(t) });
      } else if (m.kind === "Fn") {
        const fs = new Scope(scope);
        for (const p of m.params) fs.vars.set(p, { kind: "param", ty: ANY });
        for (const d of m.defaults ?? []) if (d) this.infer(d, scope);
        this.stmts(m.body, fs);
      }
    }
    this.symbols.set(c.name, scope.vars);
    this.view(c.view, scope);
    if (c.layout && this.slots !== 1) {
      this.err("LAYOUT_SLOT", `layout ${c.name} has ${this.slots} \`slot\`s; it needs exactly one`, c.loc, { expr: c.name, fixes: ["add `slot` where pages should render"] });
    }
    this.inLayout = false;
  }

  view(nodes: ViewNode[], scope: Scope) {
    for (const n of nodes) {
      if (n.kind === "IfView") {
        this.infer(n.cond, scope);
        this.view(n.then, this.narrow(n.cond, true, scope));
        if (n.else) this.view(n.else, this.narrow(n.cond, false, scope));
      } else if (n.kind === "ForView") {
        let lt = this.infer(n.list, scope);
        if (lt.k === "opt") {
          this.err("POSSIBLY_EMPTY", "the list may be null", n.list.loc, {
            expr: printExpr(n.list), expected: show(lt.of), actual: show(lt), fixes: [`${printExpr(n.list)} ?? []`],
          });
          lt = lt.of;
        }
        let elem: Ty = ANY;
        if (lt.k === "list") elem = lt.of;
        else if (lt.k !== "any") this.err("NOT_A_LIST", "`for` needs a list", n.list.loc, { expr: printExpr(n.list), expected: "T[]", actual: show(lt) });
        const s = new Scope(scope);
        s.vars.set(n.item, { kind: "loop", ty: elem });
        if (n.index) s.vars.set(n.index, { kind: "loop", ty: NUM });
        if (n.key) this.infer(n.key, s);
        this.view(n.body, s);
      } else this.element(n, scope);
    }
  }

  element(el: Element, scope: Scope) {
    if (/^[A-Z]/.test(el.tag)) return this.componentUse(el, scope);
    if (el.tag === "meta") {
      for (const p of el.props) {
        if (!["title", "description", "image"].includes(p.name) || !p.value) {
          this.err("UNKNOWN_PROP", `'meta' doesn't take '${p.name}'`, p.loc, { expr: p.name, expected: "title description image", fixes: suggest(p.name, ["title", "description", "image"]) });
        } else this.expectTy(p.value, this.infer(p.value, scope), STR);
      }
      if (el.content || el.children.length || el.action) this.err("NO_CONTENT", "`meta` only takes title=, description= and image=", el.loc, { expr: "meta", fixes: ['meta title="..." description="..."'] });
      return;
    }
    if (el.tag === "slot") {
      const named = el.content !== null;
      if (named && el.content!.kind !== "Ident") this.err("UNEXPECTED_TOKEN", "a slot's name is a plain name: `slot header`", el.loc, { expr: "slot", fixes: ["slot header"] });
      if (!this.inLayout) this.err("LAYOUT_SLOT", "`slot` only goes inside a `layout` or a `component`", el.loc, { expr: "slot", fixes: ["layout Main {\n  slot\n}"] });
      else if (named && this.layoutNow) this.err("LAYOUT_SLOT", "a layout has one unnamed `slot` (where pages render)", el.loc, { expr: "slot", fixes: ["slot"] });
      else if (!named) this.slots++;
      return;
    }
    const spec = ELEMENTS[el.tag];
    if (!spec) {
      this.err("UNKNOWN_ELEMENT", `unknown element '${el.tag}'`, el.loc, {
        expr: el.tag, fixes: suggest(el.tag, [...Object.keys(ELEMENTS), ...this.comps.keys()]),
      });
      return;
    }
    // `icon "check"`: a literal name of the built-in set (only used icons go into the app).
    if (el.tag === "icon" && el.content) {
      if (el.content.kind !== "Str") this.err("TYPE_MISMATCH", "an icon's name must be written as text: `icon \"check\"` (use `if` to switch icons)", el.content.loc, { expr: printExpr(el.content), expected: '"check"' });
      else if (!ICONS[el.content.value]) this.err("UNKNOWN_ELEMENT", `unknown icon '${el.content.value}'`, el.content.loc, { expr: el.content.value, expected: "a Lucide icon name", fixes: suggest(el.content.value, Object.keys(ICONS)) });
    }
    if (el.content) {
      if (spec.content === "bind") {
        if (!this.bindable(el.content, scope)) {
          this.err("NOT_BINDABLE", `\`${el.tag}\` binds its value to a state`, el.content.loc, {
            expr: printExpr(el.content), fixes: [`declare \`state x = ${spec.bind === "checked" || spec.bind === "open" ? "false" : spec.bind === "file" ? "null" : '""'}\` and use \`${el.tag} x\``],
          });
        }
      }
      this.infer(el.content, scope);
    }
    if (spec.bind === "choice" && !el.props.some((p) => p.name === "options" && p.value)) {
      this.err("MISSING_PROP", `'${el.tag}' needs \`options\``, el.loc, { expr: el.tag, fixes: [`${el.tag} x options=["a", "b"]`] });
    }
    if (spec.content === "bind" && !el.content) {
      this.err("MISSING_PROP", `'${el.tag}' needs a state to bind`, el.loc, { expr: el.tag, fixes: [`${el.tag} x`] });
    }
    for (const p of el.props) {
      if (p.name.startsWith("on:")) {
        this.event(p, scope);
        continue;
      }
      if (p.name.includes(":")) {
        const [bp, name] = p.name.split(":");
        const ok = BREAKPOINTS[bp] !== undefined && RESPONSIVE_PROPS.includes(name) && spec.props.includes(name);
        if (!ok) {
          this.err("UNKNOWN_PROP", `'${el.tag}' doesn't take '${p.name}'`, p.loc, {
            expr: p.name, expected: "sm|md|lg|xl : " + RESPONSIVE_PROPS.filter((x) => spec.props.includes(x)).join("|"),
            fixes: BREAKPOINTS[bp] === undefined ? suggest(bp, Object.keys(BREAKPOINTS)).map((b) => `${b}:${name}`) : [],
          });
        } else if (p.value?.kind !== "Num") {
          this.err("TYPE_MISMATCH", `'${p.name}' needs a number`, p.loc, { expr: p.name, expected: "Number literal", fixes: [`${p.name}=2`] });
        }
        continue;
      }
      if (p.name === "ref" && p.value) {
        const r = p.value.kind === "Ident" ? scope.get(p.value.name) : null;
        if (r?.kind !== "ref") {
          const name = p.value.kind === "Ident" ? p.value.name : "el";
          this.err("TYPE_MISMATCH", "`ref=` needs a name declared with `ref`", p.value.loc, { expr: printExpr(p.value), expected: "ref", actual: r?.kind ?? "undefined", fixes: [`ref ${name}`] });
        }
        continue;
      }
      if (p.value === null) {
        if (!spec.flags.includes(p.name)) {
          this.err("UNKNOWN_PROP", `'${el.tag}' doesn't take the flag '${p.name}'`, p.loc, {
            expr: p.name, expected: spec.flags.join("|") || "no flags", fixes: suggest(p.name, spec.flags),
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
        this.err("UNKNOWN_PROP", `'${el.tag}' doesn't take the prop '${p.name}'`, p.loc, {
          expr: p.name, expected: spec.props.join("|"), fixes: suggest(p.name, [...spec.props, ...spec.flags]),
        });
        continue;
      }
      const values = ENUM_PROPS[p.name];
      if (values) {
        const v = p.value.kind === "Ident" ? p.value.name : p.value.kind === "Str" ? p.value.value : null;
        if (v !== null && !values.includes(v) && !(p.value.kind === "Ident" && scope.get(v))) {
          this.err("TYPE_MISMATCH", `invalid value for '${p.name}'`, p.value.loc, { expr: v, expected: values.join("|"), fixes: suggest(v, values) });
          continue;
        }
        if (v !== null && values.includes(v)) continue;
      }
      this.infer(p.value, scope);
    }
    if (el.action) {
      if (!spec.action) this.err("NO_ACTION", `'${el.tag}' doesn't take an '->' action`, el.loc, { expr: el.tag, fixes: ["use `button \"...\" -> action`"] });
      this.stmts(el.action, new Scope(scope));
    }
    if (el.children.length) {
      if (!spec.children) this.err("NO_CHILDREN", `'${el.tag}' doesn't take children`, el.loc, { expr: el.tag, fixes: ["wrap it in `row`, `column` or `card`"] });
      this.view(el.children, scope);
    }
  }

  componentUse(el: Element, scope: Scope) {
    const comp = this.comps.get(el.tag);
    if (!comp) {
      this.err("UNKNOWN_ELEMENT", `unknown component '${el.tag}'`, el.loc, { expr: el.tag, fixes: suggest(el.tag, this.comps.keys()) });
      return;
    }
    const given = new Set<string>();
    for (const p of el.props) {
      const param = comp.params.find((x) => x.name === p.name);
      if (!param || p.value === null) {
        // A typo gets the closest prop; a new prop gets the exact signature to declare it.
        const close = suggest(p.name, comp.params.map((x) => x.name));
        const ty = p.value ? this.infer(p.value, scope) : BOOL;
        const signature = `component ${el.tag}(${[...comp.params.map((x) => `${x.name}: ${show(x.ty)}`), `${p.name}: ${show(ty)}`].join(", ")})`;
        this.err("UNKNOWN_PROP", `'${el.tag}' has no prop '${p.name}'`, p.loc, {
          expr: p.name, expected: comp.params.map((x) => x.name).join("|") || "no props", fixes: close.length ? close : [signature, `in a patch: set ${el.tag} ${p.name}: ${show(ty)}`],
        });
        continue;
      }
      given.add(p.name);
      if (p.value.kind === "Arrow") this.arrowHint = param.ty.k === "opt" ? param.ty.of : param.ty;
      this.expectTy(p.value, this.infer(p.value, scope), param.ty);
      if (this.twoWay.get(el.tag)?.has(p.name) && !this.writable(p.value, scope)) {
        this.err("NOT_BINDABLE", `${el.tag} assigns its prop '${p.name}', so it needs a state (or a field of one) here`, p.value.loc, {
          expr: printExpr(p.value), fixes: [`declare \`state ${p.name} = ...\` and pass \`${p.name}=${p.name}\``],
        });
      }
    }
    for (const p of comp.params) {
      if (p.required && !given.has(p.name)) {
        this.err("MISSING_PROP", `missing prop '${p.name}' of ${el.tag}`, el.loc, { expr: el.tag, expected: `${p.name}: ${show(p.ty)}`, fixes: [`${el.tag} ${p.name}=...`] });
      }
    }
    if (el.action) this.err("NO_ACTION", `a component doesn't take '->'`, el.loc, { expr: el.tag });
    // Children named like one of its slots (`header { ... }` for `slot header`) fill that slot;
    // the rest go to the unnamed `slot`.
    const named = el.children.filter((n): n is Element => n.kind === "Element" && n.tag !== "" && comp.slots.has(n.tag));
    for (const n of named) this.view(n.children, scope);
    const rest = el.children.filter((n) => !named.includes(n as Element));
    if (rest.length) {
      if (!comp.slots.has("")) {
        const others = [...comp.slots].filter(Boolean);
        this.err("NO_CHILDREN", `'${el.tag}' doesn't take children${others.length ? ` (its slots: ${others.join(", ")})` : ""}`, el.loc, { expr: el.tag, fixes: others.length ? others.map((s) => `${s} { ... }`) : [`add \`slot\` to component ${el.tag} where the children go`] });
      }
      this.view(rest, scope);
    }
  }

  // `on:keydown=save(event.key)`: a statement (or a function, called with the event).
  event(p: Element["props"][number], scope: Scope) {
    const ev = p.name.slice(3);
    if (!EVENTS.includes(ev)) {
      this.err("UNKNOWN_PROP", `unknown event '${ev}'`, p.loc, { expr: p.name, expected: "on:<DOM event>", fixes: suggest(ev, EVENTS).map((e) => `on:${e}`) });
    }
    if (!p.value) return;
    const s = new Scope(scope);
    s.vars.set("event", { kind: "param", ty: ANY });
    this.infer(p.value, s);
  }

  // ---------- statements ----------
  stmts(list: Stmt[], scope: Scope) {
    for (const s of list) {
      if (s.kind === "ExprStmt") this.infer(s.expr, scope);
      else if (s.kind === "Let") scope.vars.set(s.name, { kind: "let", ty: this.infer(s.init, scope) });
      else if (s.kind === "Return") {
        const t = s.value ? this.infer(s.value, scope) : { k: "void" as const };
        this.returns?.push(t);
      }
      else if (s.kind === "Try") {
        this.stmts(s.body, new Scope(scope));
        const h = new Scope(scope);
        // The caught error: `e.message` always exists; api errors also carry `status` and `details`.
        if (s.param) h.vars.set(s.param, { kind: "let", ty: { k: "obj", fields: { message: STR, status: NUM, details: ANY } } });
        this.stmts(s.handler, h);
      } else if (s.kind === "Cleanup") {
        if (!this.inHook) this.err("BAD_CLEANUP", "`cleanup` only goes inside `mount { }` or `effect { }`", s.loc, { expr: "cleanup", fixes: ["mount {\n  ...\n  cleanup { ... }\n}"] });
        this.stmts(s.body, new Scope(scope));
      } else {
        this.infer(s.cond, scope);
        this.stmts(s.then, this.narrow(s.cond, true, scope));
        if (s.else) this.stmts(s.else, this.narrow(s.cond, false, scope));
        // Early exit (`if !x { return }`): the rest of the block runs only when the condition was false.
        const last = s.then[s.then.length - 1];
        // `fail(...)` (server fns) never returns either.
        const exits = last?.kind === "Return" || (last?.kind === "ExprStmt" && last.expr.kind === "Call" && last.expr.callee.kind === "Ident" && last.expr.callee.name === "fail");
        if (!s.else && exits) this.applyNarrowing(s.cond, false, scope, scope);
      }
    }
  }

  // ---------- narrowing ----------
  // Dotted path of an expression (`x`, `user.profile`), or null if it isn't a plain path.
  pathOf(e: Expr): string | null {
    if (e.kind === "Ident") return e.name;
    if (e.kind === "Member") {
      const base = this.pathOf(e.object);
      return base === null ? null : `${base}.${e.prop}`;
    }
    return null;
  }

  // Paths proven non-null when `cond` evaluates to `truthy`.
  facts(cond: Expr, truthy: boolean): Expr[] {
    if (cond.kind === "Unary" && cond.op === "!") return this.facts(cond.arg, !truthy);
    if (cond.kind === "Binary") {
      if (cond.op === "&&") return truthy ? [...this.facts(cond.left, true), ...this.facts(cond.right, true)] : [];
      if (cond.op === "||") return truthy ? [] : [...this.facts(cond.left, false), ...this.facts(cond.right, false)];
      const other = cond.left.kind === "Null" ? cond.right : cond.right.kind === "Null" ? cond.left : null;
      if (other && this.pathOf(other) !== null) {
        if ((cond.op === "!=" && truthy) || (cond.op === "==" && !truthy)) return [other];
      }
      return [];
    }
    return truthy && this.pathOf(cond) !== null ? [cond] : [];
  }

  // New child scope where the facts of `cond` hold.
  narrow(cond: Expr, truthy: boolean, scope: Scope): Scope {
    const s = new Scope(scope);
    this.applyNarrowing(cond, truthy, scope, s);
    return s;
  }

  applyNarrowing(cond: Expr, truthy: boolean, from: Scope, into: Scope) {
    for (const e of this.facts(cond, truthy)) {
      const n = this.diags.length;
      const t = this.infer(e, from);
      this.diags.length = n; // only reading the type; errors were already reported
      if (t.k === "opt") into.narrowed.set(this.pathOf(e)!, t.of);
    }
  }

  // ---------- expressions ----------
  rootIdent(e: Expr): Expr & { kind: "Ident" } | null {
    while (e.kind === "Member" || e.kind === "Index") e = e.object;
    return e.kind === "Ident" ? e : null;
  }

  // What a two-way prop can be bound to: a state, data, computed or two-way prop, or a field of one.
  writable(e: Expr, scope: Scope): boolean {
    const root = this.rootIdent(e);
    const sym = root && scope.get(root.name);
    if (!root) return false;
    if (!sym) return true;
    return ["state", "data", "computed", "prop"].includes(sym.kind) || (e.kind !== "Ident" && sym.kind === "loop");
  }

  bindable(e: Expr, scope: Scope): boolean {
    const root = this.rootIdent(e);
    if (!root) return false;
    const sym = scope.get(root.name);
    if (!sym) return true; // already reported as UNDEFINED_NAME
    // A prop can be bound too: it's two-way, so the parent passes a state (checked where it's used).
    return sym.kind === "state" || sym.kind === "prop" || (e.kind !== "Ident" && (sym.kind === "loop" || sym.kind === "data"));
  }

  // Validates an assignment target and returns its type.
  target(t: Expr, scope: Scope): Ty {
    // `items.find(x => x.id == id).active = true` assigns into `items`.
    let r: Expr = t;
    while (r.kind === "Member" || r.kind === "Index" || (r.kind === "Call" && r.callee.kind === "Member")) r = r.kind === "Call" ? (r.callee as Expr & { kind: "Member" }).object : r.object;
    const root = r.kind === "Ident" ? r : null;
    if (!root) {
      this.err("ASSIGN_READONLY", "can't assign to this expression", t.loc, { expr: printExpr(t) });
      return ANY;
    }
    const sym = scope.get(root.name);
    const ty = this.infer(t, scope);
    if (!sym) return ty;
    const direct = t.kind === "Ident";
    // A computed can be assigned (it keeps that value until a dependency changes); a prop assigned
    // directly is bound two-way to the parent's state (checked where the component is used).
    const ok = sym.kind === "state" || sym.kind === "data" || sym.kind === "let" || sym.kind === "computed" || sym.kind === "prop" || (sym.kind === "global" && !direct) || (!direct && (sym.kind === "loop" || sym.kind === "param" || sym.kind === "ref"));
    if (!ok) {
      const fixes = sym.kind === "loop" ? ["change a field (`item.done = true`) or assign the list"] : [];
      this.err("ASSIGN_READONLY", `'${root.name}' is a ${sym.kind} and can't be changed`, t.loc, { expr: printExpr(t), actual: sym.kind, expected: "state|let", fixes });
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
      this.err("POSSIBLY_EMPTY", "the value may be null", e.loc, {
        expr: printExpr(e), expected: show(expected), actual: show(actual), fixes: [`${printExpr(e)} ?? <default value>`],
      });
      return;
    }
    this.err("TYPE_MISMATCH", `expected ${show(expected)}`, e.loc, { expr: printExpr(e), expected: show(expected), actual: show(actual) });
  }

  // `skip`: fields that may be omitted (ids on create). `partial`: no field is required (update).
  modelLiteral(e: Expr & { kind: "Object" }, model: string, opts: { skip?: Set<string>; partial?: boolean } = {}) {
    const fields = this.models.get(model);
    if (!fields) return;
    const given = new Set<string>();
    for (const p of e.props) {
      if ("spread" in p) return; // completeness can't be verified with a spread
      given.add(p.key);
      if (!(p.key in fields)) {
        this.err("UNKNOWN_FIELD", `${model} has no field '${p.key}'`, p.value.loc, { expr: p.key, expected: Object.keys(fields).join("|"), fixes: suggest(p.key, Object.keys(fields)) });
      } else {
        const ty = this.types.get(p.value) ?? ANY;
        // A relation also takes the id (`author: me.id`), or a list of ids.
        const ref = this.refTarget(model, p.key);
        const ids = ref && (fields[p.key].k === "list" ? ty.k === "list" && ty.of.k === "str" : ty.k === "str");
        // A File field takes a browser File (from `file x`, typed Any) or an uploaded file.
        if (!ids) this.expectTy(p.value, ty, fields[p.key]);
      }
    }
    if (opts.partial) return;
    const missing = Object.entries(fields).filter(([k, t]) => !given.has(k) && t.k !== "opt" && !opts.skip?.has(k));
    if (missing.length) {
      this.err("MISSING_FIELD", `missing fields of ${model}: ${missing.map((m) => m[0]).join(", ")}`, e.loc, {
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
        else this.braces(e, scope);
        return STR;
      case "Bool": return BOOL;
      case "Null": return NULL;
      case "Ident": {
        const sym = scope.get(e.name);
        if (sym) return scope.getNarrowed(e.name) ?? sym.ty;
        if (GLOBALS.has(e.name)) return ANY;
        this.err("UNDEFINED_NAME", `'${e.name}' is not defined`, e.loc, { expr: e.name, fixes: suggest(e.name, scope.names()) });
        return ANY;
      }
      case "Member": {
        // `users.loading`, `users.error` and `users.reload()` on a `data`: the state of its request.
        if (e.object.kind === "Ident" && DATA_STATE[e.prop] && scope.get(e.object.name)?.kind === "data") return DATA_STATE[e.prop];
        const path = this.pathOf(e);
        const known = path === null ? undefined : scope.getNarrowed(path);
        if (known) { this.infer(e.object, scope); return known; }
        let t = this.infer(e.object, scope);
        let wrapOpt = false;
        if (t.k === "opt") {
          if (!e.optional) {
            this.err("POSSIBLY_EMPTY", "the value may be null", e.loc, {
              expr: printExpr(e), expected: show(t.of), actual: show(t), fixes: [printExpr({ ...e, optional: true })],
            });
          }
          t = t.of;
          // `a?.b` can be null; after reporting `a.b`, keep checking as if it weren't (no cascading errors).
          wrapOpt = e.optional;
        }
        const r = this.memberTy(t, e.prop, e);
        return wrapOpt ? opt(r) : r;
      }
      case "Index": {
        const t = this.infer(e.object, scope);
        this.infer(e.index, scope);
        const base = t.k === "opt" ? t.of : t;
        if (t.k === "opt" && !e.optional) {
          this.err("POSSIBLY_EMPTY", "the value may be null", e.loc, { expr: printExpr(e), actual: show(t), fixes: [printExpr({ ...e, optional: true })] });
        }
        // Like TypeScript (without noUncheckedIndexedAccess): `xs[i]` is T. `find()` stays T?.
        if (base.k === "list") return base.of;
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
        // api.<name>.create / update: validate the object against the api's model.
        if (e.callee.kind === "Member") {
          const owner = this.types.get(e.callee.object);
          if (owner?.k === "api") this.apiArgs(owner, e.callee.prop, e.args, argTys, e.loc);
          if (owner?.k === "auth") this.authArgs(owner, e.callee.prop, e.args, argTys, e.loc);
        }
        const base = t.k === "opt" ? t.of : t;
        // A typed callback (`onSave: Fn(User)`): its arguments are checked.
        if (base.k === "fn" && base.params) e.args.forEach((a, i) => { if (base.params![i]) this.expectTy(a, argTys[i], base.params![i]); });
        if (base.k === "fn") return e.optional || t.k === "opt" ? opt(base.ret) : base.ret;
        return ANY;
      }
      case "Unary": {
        const t = this.infer(e.arg, scope);
        if (e.op === "new") return ANY;
        if (e.op === "!") return BOOL;
        if (e.op === "typeof") return STR;
        if (e.op === "await") return t.k === "async" ? t.of : t;
        if (t.k !== "num" && t.k !== "any") this.err("TYPE_MISMATCH", `'${e.op}' needs a number`, e.loc, { expr: printExpr(e), expected: "Number", actual: show(t) });
        return NUM;
      }
      case "Update": {
        const t = this.target(e.arg, scope);
        if (t.k !== "num" && t.k !== "any") this.err("TYPE_MISMATCH", `'${e.op}' needs a number`, e.loc, { expr: printExpr(e), expected: "Number", actual: show(t) });
        return NUM;
      }
      case "Binary": return this.binary(e, scope);
      case "Cond": {
        this.infer(e.test, scope);
        const a = this.infer(e.then, this.narrow(e.test, true, scope)), b = this.infer(e.else, this.narrow(e.test, false, scope));
        if (a.k === "null") return opt(b);
        if (b.k === "null") return opt(a);
        return this.assignable(a, b) && this.assignable(b, a) ? a : ANY;
      }
      case "Assign": {
        const tt = this.target(e.target, scope);
        const vt = this.infer(e.value, scope);
        if (e.op === "=") this.expectTy(e.value, vt, tt);
        else if (e.op !== "??=" && !(tt.k === "num" || tt.k === "any" || (e.op === "+=" && tt.k === "str"))) {
          this.err("TYPE_MISMATCH", `'${e.op}' needs a number`, e.loc, { expr: printExpr(e), expected: "Number", actual: show(tt) });
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
        // Passed where a typed callback goes (`onSave=(u => ...)` for `Fn(User)`): its params are typed.
        const hint = this.arrowHint;
        this.arrowHint = null;
        e.params.forEach((p, i) => s.vars.set(p, { kind: "param", ty: hint?.k === "fn" ? hint.params?.[i] ?? ANY : ANY }));
        if (Array.isArray(e.body)) {
          // Returns inside a callback belong to the callback, not to the enclosing server fn.
          const outer = this.returns;
          this.returns = null;
          this.stmts(e.body, s);
          this.returns = outer;
          return fn(ANY);
        }
        return fn(this.infer(e.body, s));
      }
      case "Spread": this.infer(e.arg, scope); return ANY;
    }
  }

  // Methods of `api.<name>`: the typed client generated for `api <name>: <Model>`.
  apiMethod(t: Ty & { k: "api" }, prop: string, e: Expr): Ty {
    const model: Ty = { k: "model", name: t.model };
    // On the server (`db.<api>`) the same methods are synchronous.
    const res = (r: Ty): Ty => fn(t.sync ? r : { k: "async", of: r });
    const methods: Record<string, Ty> = {
      list: res(list(model)),
      count: res(NUM),
      get: res(opt(model)),
      create: res(model),
      update: res(model),
      remove: res({ k: "void" }),
    };
    if (prop in methods) return methods[prop];
    // Names LLMs often reach for (REST verbs, ORM habits) map to the canonical method.
    const synonyms: Record<string, string> = {
      delete: "remove", destroy: "remove", del: "remove", all: "list", getAll: "list", findAll: "list", fetch: "list", index: "list",
      add: "create", insert: "create", post: "create", save: "create", edit: "update", patch: "update", put: "update", set: "update",
      find: "get", findById: "get", getById: "get", one: "get", read: "get",
    };
    const fixes = synonyms[prop] ? [synonyms[prop]] : suggest(prop, Object.keys(methods));
    this.err("UNKNOWN_FIELD", `${t.sync ? "db" : "api"}.${t.name} has no method '${prop}'`, e.loc, { expr: printExpr(e), expected: Object.keys(methods).join("|"), fixes });
    return ANY;
  }

  apiArgs(t: Ty & { k: "api" }, method: string, args: Expr[], tys: Ty[], loc: Loc) {
    if (method === "list" || method === "count") return this.queryArgs(t, method, args, tys, loc);
    const expectCount = { get: 1, create: 1, update: 2, remove: 1 }[method];
    if (expectCount === undefined) return;
    if (args.length !== expectCount) {
      const sig = { get: "get(id)", create: "create(obj)", update: "update(id, changes)", remove: "remove(id)" }[method]!;
      this.err("TYPE_MISMATCH", `${t.sync ? "db" : "api"}.${t.name}.${sig} takes ${expectCount} argument(s)`, loc, { expected: sig, actual: `${args.length} argument(s)` });
      return;
    }
    const obj = method === "create" ? args[0] : method === "update" ? args[1] : null;
    const objTy = method === "create" ? tys[0] : tys[1];
    if (!obj) return;
    if (obj.kind === "Object") this.modelLiteral(obj, t.model, method === "create" ? { skip: this.autoFields(t.name, t.model) } : { partial: true });
    else this.expectTy(obj, objTy, { k: "model", name: t.model });
  }

  // list({ where, search, sort, limit, offset }) / count({ where, search }): checked against the model.
  queryArgs(t: Ty & { k: "api" }, method: string, args: Expr[], tys: Ty[], loc: Loc) {
    const sig = method === "list" ? "list({ where, search, sort, limit, offset })" : "count({ where, search })";
    if (args.length > 1) {
      this.err("TYPE_MISMATCH", `${t.sync ? "db" : "api"}.${t.name}.${method} takes at most 1 argument`, loc, { expected: sig, actual: `${args.length} argument(s)` });
      return;
    }
    const q = args[0];
    if (!q) return;
    if (q.kind !== "Object") { this.expectTy(q, tys[0], { k: "obj", fields: {} }); return; }
    const keys = method === "list" ? ["where", "search", "sort", "limit", "offset", "include"] : ["where", "search"];
    const fields = Object.keys(this.models.get(t.model) ?? {});
    for (const p of q.props) {
      if ("spread" in p) continue;
      if (!keys.includes(p.key)) {
        this.err("UNKNOWN_FIELD", `${method}() has no option '${p.key}'`, p.value.loc, { expr: p.key, expected: keys.join("|"), fixes: suggest(p.key, keys) });
        continue;
      }
      const ty = this.types.get(p.value) ?? ANY;
      if (p.key === "where") {
        if (p.value.kind === "Object") this.modelLiteral(p.value, t.model, { partial: true });
        else this.expectTy(p.value, ty, { k: "obj", fields: {} });
      } else if (p.key === "include") {
        // `include: ["post.author"]`: every step of each path is a relation.
        this.expectTy(p.value, ty, list(STR));
        if (p.value.kind === "Array") for (const it of p.value.items) {
          if (it.kind !== "Str") continue;
          let model = t.model;
          for (const step of it.value.split(".")) {
            const next = this.refTarget(model, step);
            if (!next) {
              const rels = (this.program.decls.find((d): d is ModelDecl => d.kind === "Model" && d.name === model)?.fields ?? []).filter((f) => this.refTarget(model, f.name)).map((f) => f.name);
              this.err("UNKNOWN_FIELD", `'${step}' isn't a relation of ${model}`, it.loc, { expr: it.value, expected: rels.join("|") || "no relations", fixes: suggest(step, rels) });
              break;
            }
            model = next;
          }
        }
      } else if (p.key === "sort") {
        this.expectTy(p.value, ty, STR);
        // A literal sort is checked now: "field" ascending, "-field" descending.
        if (p.value.kind === "Str" && !fields.includes(p.value.value.replace(/^-/, ""))) {
          this.err("UNKNOWN_FIELD", `${t.model} has no field '${p.value.value.replace(/^-/, "")}' to sort by`, p.value.loc, { expr: p.value.value, expected: fields.join("|"), fixes: suggest(p.value.value.replace(/^-/, ""), fields) });
        }
      } else this.expectTy(p.value, ty, p.key === "search" ? STR : NUM);
    }
  }

  // Fields the server fills in on create: ids, and `owner` on private apis.
  autoFields(api: string, model: string): Set<string> {
    const s = new Set(this.idFields.get(model) ?? []);
    // Fields with a default are filled in by the server too.
    const decl = this.program.decls.find((d): d is ModelDecl => d.kind === "Model" && d.name === model);
    for (const f of decl?.fields ?? []) if (f.default) s.add(f.name);
    if (!this.privateApis.has(api)) s.delete("owner");
    return s;
  }

  authMethod(t: Ty & { k: "auth" }, prop: string, e: Expr): Ty {
    const user: Ty = { k: "model", name: t.model };
    const methods: Record<string, Ty> = {
      signup: fn({ k: "async", of: user }),
      login: fn({ k: "async", of: user }),
      logout: fn({ k: "async", of: { k: "void" } }),
      logoutAll: fn({ k: "async", of: { k: "void" } }),
      me: fn({ k: "async", of: opt(user) }),
      requestReset: fn({ k: "async", of: { k: "void" } }),
      resetPassword: fn({ k: "async", of: { k: "void" } }),
      verifyEmail: fn({ k: "async", of: { k: "void" } }),
      loginWith: fn({ k: "void" }),
    };
    if (prop in methods) return methods[prop];
    const synonyms: Record<string, string> = { forgotPassword: "requestReset", sendReset: "requestReset", resetRequest: "requestReset", reset: "resetPassword", setPassword: "resetPassword", verify: "verifyEmail", confirmEmail: "verifyEmail", register: "signup", signUp: "signup", signin: "login", signIn: "login", logIn: "login", signout: "logout", signOut: "logout", logOut: "logout", user: "me", current: "me", currentUser: "me", getUser: "me" };
    this.err("UNKNOWN_FIELD", `auth has no method '${prop}'`, e.loc, { expr: printExpr(e), expected: Object.keys(methods).join("|"), fixes: synonyms[prop] ? [synonyms[prop]] : suggest(prop, Object.keys(methods)) });
    return ANY;
  }

  authArgs(t: Ty & { k: "auth" }, method: string, args: Expr[], tys: Ty[], loc: Loc) {
    const sig: Record<string, [number, string]> = { signup: [1, "signup(obj)"], login: [2, "login(email, password)"], logout: [0, "logout()"], logoutAll: [0, "logoutAll()"], me: [0, "me()"], requestReset: [1, "requestReset(email)"], resetPassword: [2, "resetPassword(token, password)"], verifyEmail: [1, "verifyEmail(token)"], loginWith: [1, 'loginWith("google")'] };
    if (!sig[method]) return;
    if (args.length !== sig[method][0]) {
      this.err("TYPE_MISMATCH", `auth.${sig[method][1]} takes ${sig[method][0]} argument(s)`, loc, { expected: sig[method][1], actual: `${args.length} argument(s)` });
      return;
    }
    // loginWith("google"): a provider declared in `auth ... with`.
    if (method === "loginWith" && args[0].kind === "Str" && !this.oauth.includes(args[0].value)) {
      this.err("TYPE_MISMATCH", `'${args[0].value}' isn't a sign-in provider of this app`, args[0].loc, { expr: args[0].value, expected: this.oauth.join("|") || "add `with google` (or github) to `auth`", fixes: this.oauth.length ? suggest(args[0].value, this.oauth) : ["auth users with google"] });
    }
    if (method === "signup") {
      // The server assigns ids and the role.
      if (args[0].kind === "Object") this.modelLiteral(args[0], t.model, { skip: new Set([...(this.idFields.get(t.model) ?? []), "role"]) });
      else this.expectTy(args[0], tys[0], { k: "model", name: t.model });
    }
  }

  memberTy(t: Ty, prop: string, e: Expr): Ty {
    if (t.k === "model") {
      const fields = this.models.get(t.name)!;
      if (prop in fields) return fields[prop];
      this.err("UNKNOWN_FIELD", `${t.name} has no field '${prop}'`, e.loc, { expr: printExpr(e), expected: Object.keys(fields).join("|"), fixes: suggest(prop, Object.keys(fields)) });
      return ANY;
    }
    if (t.k === "api") return this.apiMethod(t, prop, e);
    if (t.k === "auth") return this.authMethod(t, prop, e);
    if (t.k === "obj") {
      if (prop in t.fields || !t.strict) return t.fields[prop] ?? ANY;
      this.err("UNKNOWN_FIELD", `no '${prop}' here`, e.loc, { expr: printExpr(e), expected: Object.keys(t.fields).join("|") || "nothing", fixes: suggest(prop, Object.keys(t.fields)) });
      return ANY;
    }
    if (t.k === "list") return listMethod(prop, t.of, t) ?? ANY;
    if (t.k === "str") return strMethod(prop) ?? ANY;
    if (t.k === "num" && (prop === "toFixed" || prop === "toString")) return fn(STR);
    return ANY;
  }

  binary(e: Expr & { kind: "Binary" }, scope: Scope): Ty {
    const l = this.infer(e.left, scope);
    // `x && x.a` / `x == null || x.a`: the right side only runs when the left allows it.
    const rightScope = e.op === "&&" ? this.narrow(e.left, true, scope) : e.op === "||" ? this.narrow(e.left, false, scope) : scope;
    const r = this.infer(e.right, rightScope);
    switch (e.op) {
      case "+":
        if (l.k === "str" || r.k === "str") return STR;
        if (l.k === "num" && r.k === "num") return NUM;
        return ANY;
      case "-": case "*": case "/": case "%": case "**":
        for (const [side, t] of [[e.left, l], [e.right, r]] as const) {
          if (t.k !== "num" && t.k !== "any") this.err("TYPE_MISMATCH", `'${e.op}' needs numbers`, side.loc, { expr: printExpr(side), expected: "Number", actual: show(t) });
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
