import type {
  ApiAccess, ApiDecl, SharedDecl, Commented, ComponentDecl, Decl, Element, Expr, Field, FnDecl, Loc, Member, ModelDecl, ObjProp, Param, Program, Prop, ServerFnDecl, Stmt, TypeRef, UseDecl, ViewNode,
} from "./ast.ts";
import { ELEMENTS } from "./elements.ts";
import { CompileError, diag, type Diagnostic } from "./errors.ts";
import { lex, type Comment, type Token } from "./lexer.ts";

const BINARY_PREC: Record<string, number> = {
  "??": 1, "||": 2, "&&": 3, "|": 3.2, "^": 3.4, "&": 3.6,
  "==": 4, "!=": 4, "===": 4, "!==": 4,
  "<": 5, ">": 5, "<=": 5, ">=": 5, "in": 5, "instanceof": 5, "<<": 5.5, ">>": 5.5, ">>>": 5.5,
  "+": 6, "-": 6, "*": 7, "/": 7, "%": 7, "**": 8,
};
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "??=", "&=", "|=", "^=", "<<=", ">>=", ">>>="]);
// Equivalent JS forms that are accepted and normalized to one canonical form.
const CANONICAL: Record<string, string> = { "===": "==", "!==": "!=" };

export function parse(src: string, file: string, startLine = 1): Program {
  const comments: Comment[] = [];
  return new Parser(lex(src, file, startLine, 1, comments), comments).program();
}

// Like parse, but keeps going after a syntax error (from the next declaration, or the next member
// or view line of a component) and returns every error, so one compile reports them all.
export function parseAll(src: string, file: string): { program: Program; errors: Diagnostic[] } {
  let toks: Token[];
  const comments: Comment[] = [];
  try { toks = lex(src, file, 1, 1, comments); } catch (e) {
    if (e instanceof CompileError) return { program: { kind: "Program", decls: [] }, errors: [e.diagnostic] };
    throw e;
  }
  const p = new Parser(toks, comments);
  p.errors = [];
  const program = p.program();
  return { program, errors: p.errors };
}

// Fragment parsers for `art patch`. `line` is the source line where the fragment starts,
// so errors point at the right line of the patch.
export function parseComponentBody(src: string, file: string, line: number): { members: Member[]; view: ViewNode[] } {
  const c = parse(`page __Patch {\n${src}\n}`, file, line - 1).decls[0] as ComponentDecl;
  return { members: c.members, view: c.view };
}

export function parseFields(src: string, file: string, line: number): Field[] {
  return (parse(`model __Patch {\n${src}\n}`, file, line - 1).decls[0] as ModelDecl).fields;
}

export function parseParams(src: string, file: string, line: number): ComponentDecl["params"] {
  return (parse(`component __Patch(${src}) {\n}`, file, line).decls[0] as ComponentDecl).params;
}

export function parseExpression(src: string, file = "<expr>"): Expr {
  const p = new Parser(lex(src, file));
  const e = p.expr();
  p.expectEnd();
  return e;
}

class Parser {
  toks: Token[];
  i = 0;
  errors: Diagnostic[] | null = null; // collecting (parseAll) instead of stopping at the first error
  hoisted: Decl[] = [];
  members: Member[] = []; // of the component being parsed: a member written inside its view joins them
  loops = 0; // `for` blocks of the view around the current node // `server fn` written inside a component: it's a top-level declaration
  comments: Comment[];
  ci = 0; // comments before index ci are attached
  constructor(toks: Token[], comments: Comment[] = []) {
    this.toks = toks;
    this.comments = comments;
  }

  // Comments on lines before `line` not attached yet.
  lead(line: number): string[] | undefined {
    const out: string[] = [];
    while (this.ci < this.comments.length && this.comments[this.ci].line < line) out.push(this.comments[this.ci++].text);
    return out.length ? out : undefined;
  }
  // Parses a node with `fn` and gives it the comments before it (taken first, so the node's own
  // children don't take them).
  noted<T extends object | null>(fn: () => T): T {
    const c = this.lead(this.tok.loc.line);
    const node = fn();
    if (c && node) (node as Commented).comments = c;
    return node;
  }
  note<T extends object>(node: T, line: number): T {
    const c = this.lead(line);
    if (c) (node as Commented).comments = c;
    return node;
  }
  // Comments right before a block's `}`: after its last node (or left for whatever comes next).
  closing(nodes: object[]) {
    if (!nodes.length) return;
    const c = this.lead(this.tok.loc.line);
    if (c) { const last = nodes[nodes.length - 1] as Commented; last.after = [...(last.after ?? []), ...c]; }
  }

  // ---------- utilities ----------
  get tok(): Token { return this.toks[this.i]; }
  peek(n = 1): Token { return this.toks[Math.min(this.i + n, this.toks.length - 1)]; }
  next(): Token { return this.toks[this.i++]; }
  is(v: string, t: Token = this.tok): boolean { return (t.t === "op" || t.t === "id") && t.v === v; }
  eat(v: string): boolean {
    if (this.is(v)) { this.i++; return true; }
    return false;
  }
  skipNl() { while (this.tok.t === "nl") this.i++; }
  skipSep() { while (this.tok.t === "nl" || this.is(";")) this.i++; }

  fail(expected: string): never {
    const t = this.tok;
    const actual = t.t === "eof" ? "end of file" : t.t === "nl" ? "a line break" : `'${t.v}'`;
    throw new CompileError(diag("UNEXPECTED_TOKEN", `expected ${expected}, got ${actual}`, t.loc, { expected, actual }));
  }
  expect(v: string): Token {
    if (!this.is(v)) this.fail(`'${v}'`);
    return this.next();
  }
  ident(what = "a name"): Token {
    if (this.tok.t !== "id") this.fail(what);
    return this.next();
  }
  expectEnd() {
    this.skipNl();
    if (this.tok.t !== "eof") this.fail("end of expression");
  }

  // ---------- declarations ----------
  // Runs `fn`; when collecting errors, a syntax error is recorded and parsing resumes at the next
  // token that starts a line at column `col` or less (or at eof), never at the same place.
  recover<T>(col: number, fn: () => T): T | null {
    if (!this.errors) return fn();
    const start = this.i;
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      this.errors.push(e.diagnostic);
      if (this.i === start) this.i++;
      while (this.tok.t !== "eof" && !(this.toks[this.i - 1]?.t === "nl" && this.tok.t !== "nl" && this.tok.loc.col <= col)) this.i++;
      if (col === 1 && this.is("}")) this.i++; // the `}` that closes the broken declaration
      return null;
    }
  }

  program(): Program {
    const decls: Decl[] = [];
    this.skipNl();
    while (this.tok.t !== "eof") {
      const d = this.noted(() => this.recover(1, () => this.decl()));
      if (d?.kind === "Auth" && d.model) {
        if (!decls.some((x) => x.kind === "Api" && x.name === d.api)) decls.push({ kind: "Api", name: d.api, model: d.model, access: "public", modelLoc: d.loc, loc: d.loc });
        delete d.model;
      }
      if (d) decls.push(d);
      this.skipNl();
    }
    decls.push(...this.hoisted);
    const rest = this.lead(Infinity);
    return { kind: "Program", decls, ...(rest ? { comments: rest } : {}) };
  }

  decl(): Decl {
    {
      if (this.is("model")) return this.model();
      if (this.is("api")) return this.api();
      if (this.is("use")) return this.use();
      if (this.is("auth")) {
        const loc = this.next().loc;
        const api = this.ident("the users api").v;
        // `auth users: User` declares the api too (fmt writes `api users: User` and `auth users`).
        const model = this.eat(":") ? this.ident("the users model") : null;
        const providers: string[] = [];
        if (this.eat("with")) do providers.push(this.ident("a sign-in provider (google, github)").v); while (this.eat(","));
        // `with password` / `with email`: what `auth` already does (models write it); not a provider.
        for (const p of ["password", "email"]) if (providers.includes(p)) providers.splice(providers.indexOf(p), 1);
        return { kind: "Auth", name: "auth", api, ...(model ? { model: model.v } : {}), ...(providers.length ? { providers } : {}), loc };
      }
      if (this.is("server")) return this.serverFn();
      if (this.is("component") || this.is("page") || this.is("layout")) return this.component();
      if (this.is("test") && this.peek().t === "str") return this.test();
      // `state`, `computed` and `fn` outside a component are shared by all of them.
      if (this.is("async") && this.is("fn", this.peek())) this.next(); // `async fn`: a fn with await is async by itself
      if ((this.is("state") || this.is("computed") || this.is("fn") || this.is("let") || this.is("const")) && this.peek().t === "id") {
        const loc = this.tok.loc;
        const member = this.member() as SharedDecl["member"];
        return { kind: "Shared", name: member.name, member, loc };
      }
      return this.fail("'use', 'model', 'api', 'auth', 'server fn', 'component', 'page' or 'test'");
    }
  }

  model(): ModelDecl {
    const loc = this.next().loc;
    const name = this.ident("a model name").v;
    this.expect("{");
    const fields = [];
    this.skipSep();
    while (!this.is("}")) {
      const f = this.ident("a field name");
      this.expect(":");
      const type = this.type();
      // A default: a literal (`= 0`, `= ""`, `= false`, `= []`, `= null`).
      const def = this.eat("=") ? this.unary() : undefined;
      const rules: Record<string, number | string | boolean> = {};
      while (this.tok.t === "id") {
        if (!["min", "max", "match", "unique", "cascade", "was", "accept"].includes(this.tok.v)) this.fail("min=, max=, match=\"regex\", unique, cascade, accept=\"image/*\" or was=\"old name\"");
        const r = this.next().v;
        if (r === "unique" || r === "cascade") { rules[r] = true; continue; }
        this.expect("=");
        const text = r === "match" || r === "was" || r === "accept";
        const neg = this.eat("-");
        if ((this.tok.t as string) !== (text ? "str" : "num")) this.fail(text ? "a string" : "a number");
        const v = this.next().v;
        rules[r] = text ? v : (neg ? -1 : 1) * Number(v);
      }
      fields.push(this.note({ name: f.v, type, ...(def ? { default: def } : {}), ...(Object.keys(rules).length ? { rules } : {}), loc: f.loc }, f.loc.line));
      this.skipSep();
    }
    this.closing(fields);
    this.expect("}");
    return { kind: "Model", name, fields, loc };
  }

  api(): ApiDecl {
    const loc = this.next().loc;
    const name = this.ident("an api name").v;
    if (!this.is(":")) {
      const plural = name[0].toLowerCase() + name.slice(1) + "s";
      throw new CompileError(diag("UNEXPECTED_TOKEN", "an api is `api <name>: <Model>`", this.tok.loc, {
        expected: "':'", actual: this.tok.t === "nl" || this.tok.t === "eof" ? "a line break" : `'${this.tok.v}'`,
        fixes: [/^[A-Z]/.test(name) ? `api ${plural}: ${name}${this.tok.t === "id" ? " " + this.tok.v : ""}  // then api.${plural}.list()` : `api ${name}: Model`],
      }));
    }
    this.next();
    const model = this.ident("the api's model");
    let access: ApiAccess = "public";
    // `login private`: the strongest word wins (private and admin imply login).
    const words = new Set<string>();
    while (this.is("login") || this.is("private") || this.is("admin")) words.add(this.next().v);
    if (words.size) access = words.has("private") ? "private" : words.has("admin") ? "admin" : "login";
    const readonly = this.eat("readonly");
    return { kind: "Api", name, model: model.v, access, ...(readonly ? { readonly } : {}), modelLoc: model.loc, loc };
  }

  use(): UseDecl {
    const loc = this.next().loc;
    if (this.tok.t !== "str") this.fail("a module name in quotes, e.g. \"date-fns\"");
    const source = this.next().v;
    const def = this.eat("as") ? this.ident("a name for the default export").v : null;
    const names: string[] = [];
    const renames: Record<string, string> = {};
    if (this.eat("{")) {
      this.skipNl();
      while (!this.is("}")) {
        const exported = this.ident("an exported name").v;
        const local = this.eat("as") ? this.ident("a local name").v : exported;
        if (local !== exported) renames[local] = exported;
        names.push(local);
        this.skipNl();
        if (!this.eat(",")) break;
        this.skipNl();
      }
      this.expect("}");
    }
    if (!def && !names.length) this.fail("`as name` or `{ names }` after the module");
    return { kind: "Use", name: `use ${source}`, source, default: def, names, ...(Object.keys(renames).length ? { renames } : {}), loc };
  }

  // Steps are written like commands (`see "Total: 3"`, `click "Add" 1`): a name and literal
  // arguments; `see("x")` works too.
  test(): Decl {
    const loc = this.next().loc;
    const description = this.next().v;
    this.expect("{");
    const body: Stmt[] = [];
    this.skipSep();
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("'}'");
      const step = this.ident("a test step (open, see, notSee, click, link, fill, press, select, check)");
      const args: Expr[] = [];
      if (this.eat("(")) {
        while (!this.is(")")) { args.push(this.unary()); if (!this.eat(",")) break; }
        this.expect(")");
      } else while (this.tok.t === "str" || this.tok.t === "num") args.push(this.unary());
      const callee: Expr = { kind: "Ident", name: step.v, loc: step.loc };
      body.push({ kind: "ExprStmt", expr: { kind: "Call", callee, args, optional: false, loc: step.loc }, loc: step.loc });
      this.skipSep();
    }
    this.expect("}");
    return { kind: "Test", name: `test ${JSON.stringify(description)}`, description, body, loc };
  }

  serverFn(): ServerFnDecl {
    const loc = this.next().loc;
    if (this.eat("job")) {
      const name = this.ident("a job name").v;
      if (!this.eat("every")) this.fail("`every \"1h\"` (s, m, h or d)");
      if (this.tok.t !== "str") this.fail("an interval like \"30s\", \"5m\", \"1h\" or \"1d\"");
      const every = this.next().v;
      return { kind: "ServerFn", name, params: [], every, body: this.block(), loc };
    }
    this.expect("fn");
    const name = this.ident("a function name").v;
    const { params, defaults } = this.fnParams();
    return { kind: "ServerFn", name, params, ...(defaults.some(Boolean) ? { defaults } : {}), body: this.block(), loc };
  }

  // `(a, b: Number, c = 1)`: TypeScript-style annotations are accepted and dropped (the checker
  // infers types); defaults are kept.
  fnParams(): { params: string[]; defaults: (Expr | null)[] } {
    if (this.is("{")) return { params: [], defaults: [] }; // `fn save { }`: no parameters
    this.expect("(");
    const params: string[] = [], defaults: (Expr | null)[] = [];
    while (!this.is(")")) {
      params.push(this.ident("a parameter name").v);
      if (this.eat(":")) this.type();
      defaults.push(this.eat("=") ? this.ternary() : null);
      if (!this.eat(",")) break;
    }
    this.expect(")");
    return { params, defaults };
  }

  // A prop value: a literal, name, call or `(expr)`, and (as LLMs write) a comparison or other
  // binary expression right after it: `muted=error == ""`, `disabled=n > 3`.
  propValue(): Expr {
    if (this.arrowAhead()) return this.arrow(); // `onAdd=(a, b) => add(a, b)` without parentheses around it
    const first = this.unary();
    const t = this.tok;
    if (t.t !== "op" || BINARY_PREC[t.v] === undefined) return first;
    const value = this.binary(0, first);
    if (!this.eat("?")) return value;
    const then = this.unary();
    this.expect(":");
    return { kind: "Cond", test: value, then, else: this.unary(), loc: value.loc };
  }

  type(): TypeRef {
    // A TypeScript function type (`(id: Number) => void`, `() => void`) is `Fn`.
    if (this.is("(")) {
      const loc = this.tok.loc;
      for (let depth = 0; ;) {
        const t = this.next();
        if (t.t === "eof") this.fail("')'");
        if (t.v === "(") depth++;
        else if (t.v === ")" && --depth === 0) break;
      }
      if (this.eat("=>")) {
        if (this.is("(")) this.type();
        else this.ident("a return type");
      }
      return { name: "Fn", list: false, optional: this.eat("?"), loc };
    }
    // An inline object type (`{ id: String, qty: Number }[]`) is `Any`.
    if (this.is("{")) {
      const loc = this.tok.loc;
      for (let depth = 0; ;) {
        const t = this.next();
        if (t.t === "eof") this.fail("'}'");
        if (t.v === "{") depth++;
        else if (t.v === "}" && --depth === 0) break;
      }
      const list = this.is("[") && this.is("]", this.peek());
      if (list) this.i += 2;
      return { name: "Any", list, optional: this.eat("?"), loc };
    }
    const t = this.ident("a type");
    if (t.v === "Function" || t.v === "void") t.v = t.v === "void" ? "Any" : "Fn";
    // `Fn(User, Number)`: a callback with typed parameters.
    let params: TypeRef[] | undefined;
    if (t.v === "Fn" && this.is("(")) {
      this.next();
      params = [];
      while (!this.is(")")) {
        params.push(this.type());
        if (!this.eat(",")) break;
      }
      this.expect(")");
    }
    let list = false;
    if (this.is("[") && this.is("]", this.peek())) { this.i += 2; list = true; }
    const optional = this.eat("?");
    return { name: t.v, list, optional, ...(params ? { params } : {}), loc: t.loc };
  }

  component(): ComponentDecl {
    const kw = this.next();
    const page = kw.v === "page";
    const layout = kw.v === "layout";
    const name = this.ident(page ? "a page name" : layout ? "a layout name" : "a component name").v;
    let path: string | null = null;
    let layoutName: string | null = null;
    const params: Param[] = [];
    if (page && this.tok.t === "str") path = this.next().v;
    // `page X "/x" layout Main`, and `layout Docs layout Site` (a layout inside another).
    if ((page || layout) && this.eat("layout")) layoutName = this.ident("a layout name").v;
    let requires: "login" | "admin" | undefined;
    if (page && this.eat("requires")) {
      if (!this.is("login") && !this.is("admin")) this.fail("`login` or `admin`");
      requires = this.next().v as "login" | "admin";
    }
    if (!page && this.eat("(")) {
      while (!this.is(")")) {
        const p = this.ident("a prop name");
        // `(item, onRemove)` / `(compact = false)`: an untyped prop is Any, or the type of its default.
        const type: TypeRef = this.eat(":") ? this.type() : { name: "Any", list: false, optional: false, loc: p.loc };
        const def = this.eat("=") ? this.expr() : null;
        if (type.name === "Any" && def) type.name = def.kind === "Str" || def.kind === "Template" ? "String" : def.kind === "Num" ? "Number" : def.kind === "Bool" ? "Bool" : "Any";
        params.push({ name: p.v, type, default: def, loc: p.loc });
        if (!this.eat(",")) break;
      }
      this.expect(")");
    }
    this.expect("{");
    const members: Member[] = [];
    const view: ViewNode[] = [];
    this.members = members;
    this.skipSep();
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("'}'");
      // A bad member or view line is reported and the next line of the component is parsed.
      const col = this.tok.loc.col;
      this.recover(col, () => {
        if (this.declAhead()) this.hoisted.push(this.decl());
        // `view { ... }` around the view (other frameworks have it): its content is the view.
        else if (this.is("view") && this.is("{", this.peek())) { this.next(); view.push(...this.viewBlock()); }
        else if (this.memberAhead()) members.push(this.noted(() => this.member()));
        else view.push(this.noted(() => this.viewNode()));
      });
      this.skipSep();
    }
    this.closing(view.length ? view : members);
    this.expect("}");
    return { kind: "Component", page, ...(layout ? { layout: true } : {}), name, path, ...(layoutName ? { layoutName } : {}), ...(requires ? { requires } : {}), params, members, view, loc: kw.loc };
  }

  // `api users: User`, `model X { }`, `auth users` or `server fn` written inside a component: they
  // are top-level declarations (fmt moves them out).
  declAhead(): boolean {
    const n = this.peek();
    if (this.is("server")) return this.is("fn", n) || this.is("job", n);
    if (this.is("api")) return n.t === "id" && this.is(":", this.peek(2));
    if (this.is("model")) return n.t === "id" && this.is("{", this.peek(2));
    if (this.is("auth")) return n.t === "id" && (this.peek(2).t === "nl" || this.is("with", this.peek(2)) || this.is(":", this.peek(2)));
    return false;
  }

  memberAhead(): boolean {
    if (this.is("state") || this.is("computed") || this.is("fn") || this.is("data")) return true;
    if (this.is("async") && this.is("fn", this.peek())) return true;
    if (this.is("ref")) return this.peek().t === "id";
    // `let x = ...` in a component is a derived value: a `computed` (fmt writes it that way).
    if (this.is("let") || this.is("const")) return this.peek().t === "id" && (this.is("=", this.peek(2)) || this.is(":", this.peek(2)));
    if (this.is("style") && this.peek().t === "css") return true;
    return (this.is("mount") || this.is("effect")) && this.is("{", this.peek());
  }

  member(): Member {
    const kw = this.next();
    if (kw.v === "async" && this.is("fn")) return this.member(); // the word is dropped
    if (kw.v === "style") return { kind: "Style", name: "style", css: this.next().v, loc: kw.loc };
    if (kw.v === "mount" || kw.v === "effect") {
      return { kind: kw.v === "mount" ? "Mount" : "Effect", name: kw.v, body: this.block(), loc: kw.loc };
    }
    const name = this.ident().v;
    // `ref timer = null`: a variable, not an element: a `state` (fmt writes it that way).
    if (kw.v === "ref" && this.is("=")) kw.v = "state";
    if (kw.v === "ref") return { kind: "Ref", name, loc: kw.loc };
    if (kw.v === "let" || kw.v === "const") kw.v = "computed";
    if (kw.v === "computed" && this.eat(":")) this.type(); // `let total: Number = ...`: annotation dropped
    if (kw.v === "state") {
      const type = this.eat(":") ? this.type() : null;
      // `state picked: File?` / `state rows: Row[]` without a value start as null / [].
      if (type && (type.optional || type.list) && !this.is("=")) {
        return { kind: "State", name, type, init: type.list && !type.optional ? { kind: "Array", items: [], loc: kw.loc } : { kind: "Null", loc: kw.loc }, loc: kw.loc };
      }
      this.expect("=");
      return { kind: "State", name, type, init: this.expr(), loc: kw.loc };
    }
    // `data products = [...]`: a literal isn't loaded from anywhere: a `state`.
    if (kw.v === "data" && this.is("=") && (this.is("[", this.peek()) || this.is("{", this.peek()))) {
      this.next();
      return { kind: "State", name, type: null, init: this.expr(), loc: kw.loc };
    }
    if (kw.v === "computed" || kw.v === "data") {
      this.expect("=");
      // `computed x = { if a { return 1 } return 2 }`: a block with statements is called in place.
      let ahead = 1;
      while (this.peek(ahead).t === "nl") ahead++;
      const next = this.peek(ahead);
      const block = this.is("{") && next.t === "id" && ["if", "let", "const", "return", "try", "for"].includes(next.v);
      const expr: Expr = block ? { kind: "Call", callee: { kind: "Arrow", params: [], body: returning(this.block()), loc: kw.loc }, args: [], optional: false, loc: kw.loc } : this.expr();
      if (kw.v === "data" && this.is("live")) {
        this.next();
        return { kind: "Data", name, expr, live: true, loc: kw.loc };
      }
      return { kind: kw.v === "data" ? "Data" : "Computed", name, expr, loc: kw.loc };
    }
    const { params, defaults } = this.fnParams();
    const fn: FnDecl = { kind: "Fn", name, params, ...(defaults.some(Boolean) ? { defaults } : {}), body: this.block(), loc: kw.loc };
    return fn;
  }

  // ---------- view ----------
  viewBlock(): ViewNode[] {
    this.expect("{");
    const nodes: ViewNode[] = [];
    this.skipSep();
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("'}'");
      // A member written among the elements (`computed total = ...` inside a column) is the
      // component's; inside a `for` it could depend on the item, so there it's an error (below).
      if (this.memberAhead() && !(this.loops && (this.is("let") || this.is("const")))) this.members.push(this.noted(() => this.member()));
      else nodes.push(this.noted(() => this.viewNode()));
      this.skipSep();
    }
    this.closing(nodes);
    this.expect("}");
    return nodes;
  }

  viewNode(): ViewNode {
    const t = this.tok;
    if ((this.is("let") || this.is("const")) && this.peek().t === "id" && this.is("=", this.peek(2))) {
      const name = this.peek().v;
      throw new CompileError(diag("STATEMENT_IN_VIEW", "`let` can't go inside the view", t.loc, {
        expr: name, expected: "a UI element, 'if' or 'for'", actual: "'let'",
        fixes: [`computed ${name} = ...  // with the states and fns, before the view`, "write the expression where it's used", "inside a `for`: a component that receives the item"],
      }));
    }
    if (this.is("if")) {
      this.next();
      const cond = this.expr();
      const then = this.viewBlock();
      let els: ViewNode[] | null = null;
      if (this.elseAhead()) {
        this.next();
        els = this.is("if") ? [this.viewNode()] : this.viewBlock();
      }
      return { kind: "IfView", cond, then, else: els, loc: t.loc };
    }
    if (this.is("for")) {
      this.next();
      const item = this.ident("a loop variable").v;
      const index = this.eat(",") ? this.ident("an index variable").v : null;
      this.expect("in");
      const list = this.expr();
      const key = this.is("key") ? (this.next(), this.expr()) : null;
      this.loops++;
      try { return { kind: "ForView", item, index, list, ...(key ? { key } : {}), body: this.viewBlock(), loc: t.loc }; } finally { this.loops--; }
    }
    return this.element();
  }

  // `}` followed (possibly after newlines) by `else`.
  elseAhead(): boolean {
    return this.keywordAhead("else");
  }

  keywordAhead(kw: string): boolean {
    let j = this.i;
    while (this.toks[j].t === "nl") j++;
    if (this.is(kw, this.toks[j])) { this.i = j; return true; }
    return false;
  }

  element(): Element {
    const tag = this.ident("a UI element, 'if' or 'for'");
    const spec = ELEMENTS[tag.v];
    const isComponent = /^[A-Z]/.test(tag.v);
    let content: Expr | null = null;
    const props: Prop[] = [];

    const atEnd = () => this.tok.t === "nl" || this.tok.t === "eof" || this.is("}") || this.is("{") || this.is("->") || this.is(";");
    // `name=` or `on:click=` / `md:cols=` (a prop, not the element's content).
    const t = (n: number) => this.toks[this.i + n];
    const propAhead = () => this.tok.t === "id" && (this.is("=", t(1)) || (this.is(":", t(1)) && t(2)?.t === "id" && this.is("=", t(3))));
    const takesContent = !isComponent && tag.v !== "meta" && !(spec && spec.content === null);

    // A call where an element goes (`navigate("/")`, `if me { load() }` in the view): statements
    // belong in an action, a fn or a hook.
    if (!spec && !isComponent && this.is("(") && this.tok.loc.col === tag.loc.col + tag.v.length) {
      throw new CompileError(diag("STATEMENT_IN_VIEW", `'${tag.v}(...)' is a statement, and the view only holds elements`, tag.loc, {
        expr: tag.v, expected: "a UI element, 'if' or 'for'", actual: "a call",
        fixes: [`effect { ${tag.v}(...) }  // re-runs when the states it reads change`, `mount { ${tag.v}(...) }  // once`, `button "..." -> ${tag.v}(...)`],
      }));
    }
    if (takesContent && !atEnd() && !propAhead()) content = this.ternary();
    // `Card()` / `Card(title="x", big)`: called like a function; the parentheses and commas are dropped.
    const called = isComponent && this.is("(") && this.tok.loc.line === tag.loc.line && this.tok.loc.col === tag.loc.col + tag.v.length;
    if (called) this.next();
    const readProps = () => {
      while (!atEnd()) {
        if (called && (this.is(",") || this.is(")"))) { this.next(); continue; }
        // The content written after a prop (`image alt="Photo" user.photo.url`): fmt moves it first.
        const n1 = this.peek();
        if (takesContent && content === null && (this.tok.t === "str" || this.tok.t === "tpl" || (this.tok.t === "id" && n1.t === "op" && [".", "?.", "(", "["].includes(n1.v)))) {
          content = this.ternary();
          continue;
        }
        const p = this.ident("a prop (name=value) or flag");
        // `aria-expanded=open`, `data-step=2`: attribute names with dashes.
        while ((p.v === "aria" || p.v === "data" || p.v.startsWith("aria-") || p.v.startsWith("data-")) && this.is("-") && this.tok.loc.line === p.loc.line && this.tok.loc.col === p.loc.col + p.v.length && this.peek().t === "id") {
          this.next();
          p.v += "-" + this.next().v;
        }
        // `on:keydown=save()` (an event handler) and `md:cols=3` (from a screen width up).
        if (this.is(":") && this.peek().t === "id") {
          this.next();
          const name = `${p.v}:${this.next().v}`;
          if (p.v === "on" && !this.is("=")) this.expect("=");
          props.push({ name, value: this.eat("=") ? this.propValue() : null, loc: p.loc });
          continue;
        }
        if (this.eat("=")) props.push({ name: p.v, value: this.propValue(), loc: p.loc });
        else props.push({ name: p.v, value: null, loc: p.loc });
      }
    };
    readProps();
    let action: Stmt[] | null = null;
    if (this.eat("->")) {
      action = this.is("{") ? this.block() : [this.stmt()];
      // `-> save` names the function without calling it: it's called.
      for (const s of action) if (s.kind === "ExprStmt" && (s.expr.kind === "Ident" || s.expr.kind === "Member")) s.expr = { kind: "Call", callee: s.expr, args: [], optional: false, loc: s.expr.loc };
      // LLMs often write props after the action (`-> dec() disabled=x`); accept it, fmt moves them first.
      readProps();
    }
    const children = this.is("{") ? this.viewBlock() : [];
    // A prop without a value on a component (`Badge big`) is true, as a flag on an element.
    if (isComponent) for (const p of props) p.value ??= { kind: "Bool", value: true, loc: p.loc };
    return { kind: "Element", tag: tag.v, content, props, action, children, loc: tag.loc };
  }

  // ---------- statements ----------
  block(): Stmt[] {
    this.expect("{");
    const out: Stmt[] = [];
    this.skipSep();
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("'}'");
      out.push(this.noted(() => this.stmt()));
      this.skipSep();
    }
    this.closing(out);
    this.expect("}");
    return out;
  }

  stmt(): Stmt {
    const t = this.tok;
    // `fn helper(a) { ... }` inside a block (as models write inner functions): a let with an arrow.
    if (this.is("fn") && this.peek().t === "id" && this.is("(", this.peek(2))) {
      this.next();
      const name = this.ident().v;
      const { params } = this.fnParams();
      return { kind: "Let", name, init: { kind: "Arrow", params, body: this.block(), loc: t.loc }, loc: t.loc };
    }
    if (this.is("let") || this.is("const")) {
      this.next();
      const name = this.ident().v;
      this.expect("=");
      return { kind: "Let", name, init: this.expr(), loc: t.loc };
    }
    if (this.is("if")) {
      this.next();
      const cond = this.expr();
      // `if x == "" return` (one statement without braces), as in JavaScript.
      const then = this.is("{") ? this.block() : [this.stmt()];
      let els: Stmt[] | null = null;
      if (this.elseAhead()) {
        this.next();
        els = this.is("if") ? [this.stmt()] : this.block();
      }
      return { kind: "If", cond, then, else: els, loc: t.loc };
    }
    if (this.is("for")) {
      this.next();
      // JavaScript's forms are accepted too: `for (const x of xs)`, `for (let i = 0; i < n; i++)`.
      const paren = this.eat("(");
      if (this.is("let") || this.is("const")) this.next();
      const item = this.ident("a loop variable").v;
      if (this.eat("=")) {
        const init = this.expr();
        this.expect(";");
        const cond = this.expr();
        this.expect(";");
        const update = this.expr();
        if (paren) this.expect(")");
        return { kind: "Loop", name: item, init, cond, update, body: this.block(), loc: t.loc };
      }
      const index = this.eat(",") ? this.ident("an index variable").v : null;
      if (!this.is("in") && !this.is("of")) this.fail("'in'");
      this.next();
      const list = this.expr();
      if (paren) this.expect(")");
      return { kind: "For", item, index, list, body: this.block(), loc: t.loc };
    }
    if (this.is("try")) {
      this.next();
      const body = this.block();
      // `try { } finally { }` (no catch): the error goes on after the `finally`.
      if (this.keywordAhead("finally")) {
        this.next();
        return { kind: "Try", body, param: null, handler: [], rethrow: true, finally: this.block(), loc: t.loc };
      }
      if (!this.keywordAhead("catch")) this.fail("'catch'");
      this.next();
      // `catch (e)`, `catch e` and a bare `catch` are all accepted.
      let param: string | null = null;
      if (this.eat("(")) { param = this.ident("an error name").v; this.expect(")"); }
      else if (this.tok.t === "id") param = this.next().v;
      const handler = this.block();
      const last = this.keywordAhead("finally") ? (this.next(), this.block()) : null;
      return { kind: "Try", body, param, handler, ...(last ? { finally: last } : {}), loc: t.loc };
    }
    if (this.is("while")) {
      this.next();
      return { kind: "While", cond: this.expr(), body: this.block(), loc: t.loc };
    }
    if ((this.is("break") || this.is("continue")) && (this.peek().t === "nl" || this.is("}", this.peek()) || this.is(";", this.peek()))) {
      this.next();
      return { kind: t.v === "break" ? "Break" : "Continue", loc: t.loc };
    }
    if (this.is("cleanup") && this.is("{", this.peek())) {
      this.next();
      return { kind: "Cleanup", body: this.block(), loc: t.loc };
    }
    if (this.is("return")) {
      this.next();
      const value = this.tok.t === "nl" || this.is("}") || this.is(";") ? null : this.expr();
      return { kind: "Return", value, loc: t.loc };
    }
    return { kind: "ExprStmt", expr: this.expr(), loc: t.loc };
  }

  // ---------- expressions ----------
  expr(): Expr {
    if (this.arrowAhead()) return this.arrow();
    const left = this.ternary();
    if (this.tok.t === "op" && ASSIGN_OPS.has(this.tok.v)) {
      const op = this.next();
      return { kind: "Assign", op: op.v, target: left, value: this.expr(), loc: left.loc };
    }
    return left;
  }

  arrowAhead(): boolean {
    // `async x => ...` / `async (a) => ...`: the word is dropped (an arrow with `await` is async by itself).
    if (this.is("async") && this.tok.t === "id") {
      const save = this.i;
      this.next();
      const yes = this.arrowAhead();
      if (!yes) this.i = save;
      return yes;
    }
    if (this.is("=>")) return true; // `=> save()`: no parameters
    if (this.tok.t === "id" && this.is("=>", this.peek())) return true;
    if (!this.is("(")) return false;
    let depth = 0;
    for (let j = this.i; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.t === "op" && t.v === "(") depth++;
      else if (t.t === "op" && t.v === ")" && --depth === 0) return this.is("=>", this.toks[j + 1]);
    }
    return false;
  }

  arrow(): Expr {
    const loc = this.tok.loc;
    const params: string[] = [];
    if (this.eat("(")) {
      while (!this.is(")")) {
        params.push(this.ident("a parameter").v);
        if (this.eat(":")) this.type(); // `(p: Product) => ...`: annotation dropped
        if (!this.eat(",")) break;
      }
      this.expect(")");
    } else if (!this.is("=>")) params.push(this.next().v);
    this.expect("=>");
    const body = this.is("{") ? this.block() : this.expr();
    return { kind: "Arrow", params, body, loc };
  }

  ternary(): Expr {
    const test = this.binary(0);
    if (!this.eat("?")) return test;
    this.skipNl();
    const then = this.expr();
    this.skipNl();
    this.expect(":");
    this.skipNl();
    return { kind: "Cond", test, then, else: this.expr(), loc: test.loc };
  }

  binary(min: number, first?: Expr): Expr {
    let left = first ?? this.unary();
    for (;;) {
      const t = this.tok;
      // `"x" in obj` and `e instanceof Error` are words, not symbols.
      const prec = t.t === "op" || (t.t === "id" && (t.v === "in" || t.v === "instanceof")) ? BINARY_PREC[t.v] : undefined;
      if (prec === undefined || prec <= min) break;
      this.next();
      const right = this.binary(t.v === "**" ? prec - 1 : prec); // ** is right-associative
      left = { kind: "Binary", op: CANONICAL[t.v] ?? t.v, left, right, loc: left.loc };
    }
    return left;
  }

  unary(): Expr {
    const t = this.tok;
    if (t.t === "op" && (t.v === "!" || t.v === "-" || t.v === "+" || t.v === "~")) {
      this.next();
      return { kind: "Unary", op: t.v, arg: this.unary(), loc: t.loc };
    }
    if (this.is("typeof") || this.is("await")) {
      this.next();
      return { kind: "Unary", op: t.v, arg: this.unary(), loc: t.loc };
    }
    // `new Chart(box, opts)`: the operand is the call (`new a.b(c).d` keeps JS's meaning when printed back).
    if (this.is("new")) {
      this.next();
      return { kind: "Unary", op: "new", arg: this.postfix(), loc: t.loc };
    }
    if (t.t === "op" && (t.v === "++" || t.v === "--")) {
      this.next();
      return { kind: "Update", op: t.v, prefix: true, arg: this.unary(), loc: t.loc };
    }
    return this.postfix();
  }

  postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.tok;
      if (this.eat(".")) {
        e = { kind: "Member", object: e, prop: this.ident("a property name").v, optional: false, loc: e.loc };
      } else if (this.eat("?.")) {
        if (this.eat("(")) e = { kind: "Call", callee: e, args: this.args(), optional: true, loc: e.loc };
        else if (this.eat("[")) { e = { kind: "Index", object: e, index: this.expr(), optional: true, loc: e.loc }; this.expect("]"); }
        else e = { kind: "Member", object: e, prop: this.ident("a property name").v, optional: true, loc: e.loc };
      } else if (this.eat("[")) {
        e = { kind: "Index", object: e, index: this.expr(), optional: false, loc: e.loc };
        this.expect("]");
      } else if (this.eat("(")) {
        e = { kind: "Call", callee: e, args: this.args(), optional: false, loc: e.loc };
      } else if (t.t === "op" && (t.v === "++" || t.v === "--")) {
        this.next();
        e = { kind: "Update", op: t.v, prefix: false, arg: e, loc: e.loc };
      } else return e;
    }
  }

  // Argument list; the `(` has already been consumed.
  args(): Expr[] {
    const out: Expr[] = [];
    while (!this.is(")")) {
      out.push(this.spreadOrExpr());
      if (!this.eat(",")) break;
    }
    this.expect(")");
    return out;
  }

  spreadOrExpr(): Expr {
    const t = this.tok;
    if (this.eat("...")) return { kind: "Spread", arg: this.expr(), loc: t.loc };
    return this.expr();
  }

  primary(): Expr {
    const t = this.tok;
    const loc: Loc = t.loc;
    if (t.t === "num") { this.next(); return { kind: "Num", value: Number(t.v), ...(String(Number(t.v)) === t.v ? {} : { raw: t.v }), loc }; }
    if (t.t === "str") { this.next(); return { kind: "Str", value: t.v, loc }; }
    if (t.t === "regex") { this.next(); return { kind: "Regex", source: t.v, loc }; }
    if (t.t === "tpl") {
      this.next();
      const exprs = t.parts!.map((p) => {
        const sub = new Parser(lex(p.src, loc.file, p.line, p.col));
        const e = sub.expr();
        sub.expectEnd();
        return e;
      });
      return { kind: "Template", quasis: t.quasis!, exprs, loc };
    }
    if (t.t === "id") {
      this.next();
      if (t.v === "true" || t.v === "false") return { kind: "Bool", value: t.v === "true", loc };
      if (t.v === "null" || t.v === "undefined") return { kind: "Null", loc };
      return { kind: "Ident", name: t.v, loc };
    }
    if (this.eat("(")) {
      const e = this.expr();
      this.expect(")");
      return e;
    }
    if (this.eat("[")) {
      const items: Expr[] = [];
      while (!this.is("]")) {
        items.push(this.spreadOrExpr());
        // One item per line without commas (models write lists of objects that way): fmt adds them.
        // (also side by side: `["a" "b"]`)
        if (!this.eat(",") && !(this.tok.t !== "eof" && this.tok.loc.line > this.toks[this.i - 1].loc.line) && this.tok.t !== "str" && this.tok.t !== "num") break;
      }
      this.expect("]");
      return { kind: "Array", items, loc };
    }
    if (this.eat("{")) {
      const props: ObjProp[] = [];
      this.skipNl();
      while (!this.is("}")) {
        if (this.eat("...")) props.push({ spread: this.expr() });
        else if (this.eat("[")) {
          const computed = this.expr();
          this.expect("]");
          this.expect(":");
          props.push({ computed, value: this.expr() });
        } else {
          const k = this.tok;
          if (k.t !== "id" && k.t !== "str") this.fail("a property name");
          this.next();
          if (this.eat(":")) { this.skipNl(); props.push({ key: k.v, value: this.expr() }); }
          else props.push({ key: k.v, value: { kind: "Ident", name: k.v, loc: k.loc } });
        }
        const newLine = this.tok.t === "nl";
        this.skipNl();
        if (!this.eat(",") && !newLine) break; // one property per line without commas is accepted
        this.skipNl();
      }
      this.skipNl();
      this.expect("}");
      return { kind: "Object", props, loc };
    }
    this.fail("an expression");
  }
}

// A block used as a value (`computed x = { if a { "one" } else { "two" } }`): its last expression
// is what it returns.
function returning(body: Stmt[]): Stmt[] {
  const last = body[body.length - 1];
  if (last?.kind === "ExprStmt") body[body.length - 1] = { kind: "Return", value: last.expr, loc: last.loc };
  else if (last?.kind === "If") {
    returning(last.then);
    if (last.else) returning(last.else);
  }
  return body;
}
