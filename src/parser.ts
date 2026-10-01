import type {
  ApiAccess, ApiDecl, ComponentDecl, Decl, Element, Expr, Field, FnDecl, Loc, Member, ModelDecl, ObjProp, Param, Program, Prop, ServerFnDecl, Stmt, TypeRef, UseDecl, ViewNode,
} from "./ast.ts";
import { ELEMENTS } from "./elements.ts";
import { CompileError, diag } from "./errors.ts";
import { lex, type Token } from "./lexer.ts";

const BINARY_PREC: Record<string, number> = {
  "??": 1, "||": 2, "&&": 3,
  "==": 4, "!=": 4, "===": 4, "!==": 4,
  "<": 5, ">": 5, "<=": 5, ">=": 5,
  "+": 6, "-": 6, "*": 7, "/": 7, "%": 7, "**": 8,
};
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "??="]);
// Equivalent JS forms that are accepted and normalized to one canonical form.
const CANONICAL: Record<string, string> = { "===": "==", "!==": "!=" };

export function parse(src: string, file: string, startLine = 1): Program {
  return new Parser(lex(src, file, startLine)).program();
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
  constructor(toks: Token[]) {
    this.toks = toks;
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
  program(): Program {
    const decls: Decl[] = [];
    this.skipNl();
    while (this.tok.t !== "eof") {
      if (this.is("model")) decls.push(this.model());
      else if (this.is("api")) decls.push(this.api());
      else if (this.is("use")) decls.push(this.use());
      else if (this.is("auth")) {
        const loc = this.next().loc;
        const api = this.ident("the users api").v;
        decls.push({ kind: "Auth", name: "auth", api, loc });
      } else if (this.is("server")) decls.push(this.serverFn());
      else if (this.is("component") || this.is("page") || this.is("layout")) decls.push(this.component());
      else this.fail("'use', 'model', 'api', 'auth', 'server fn', 'component' or 'page'");
      this.skipNl();
    }
    return { kind: "Program", decls };
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
      const rules: Record<string, number | string | boolean> = {};
      while (this.tok.t === "id") {
        if (!["min", "max", "match", "unique"].includes(this.tok.v)) this.fail("min=, max=, match=\"regex\" or unique");
        const r = this.next().v;
        if (r === "unique") { rules.unique = true; continue; }
        this.expect("=");
        const neg = this.eat("-");
        if ((this.tok.t as string) !== (r === "match" ? "str" : "num")) this.fail(r === "match" ? "a string" : "a number");
        const v = this.next().v;
        rules[r] = r === "match" ? v : (neg ? -1 : 1) * Number(v);
      }
      fields.push({ name: f.v, type, ...(Object.keys(rules).length ? { rules } : {}), loc: f.loc });
      this.skipSep();
    }
    this.expect("}");
    return { kind: "Model", name, fields, loc };
  }

  api(): ApiDecl {
    const loc = this.next().loc;
    const name = this.ident("an api name").v;
    this.expect(":");
    const model = this.ident("the api's model");
    let access: ApiAccess = "public";
    if (this.is("login") || this.is("private") || this.is("admin")) access = this.next().v as ApiAccess;
    return { kind: "Api", name, model: model.v, access, modelLoc: model.loc, loc };
  }

  use(): UseDecl {
    const loc = this.next().loc;
    if (this.tok.t !== "str") this.fail("a module name in quotes, e.g. \"date-fns\"");
    const source = this.next().v;
    const def = this.eat("as") ? this.ident("a name for the default export").v : null;
    const names: string[] = [];
    if (this.eat("{")) {
      this.skipNl();
      while (!this.is("}")) {
        names.push(this.ident("an exported name").v);
        this.skipNl();
        if (!this.eat(",")) break;
        this.skipNl();
      }
      this.expect("}");
    }
    if (!def && !names.length) this.fail("`as name` or `{ names }` after the module");
    return { kind: "Use", name: `use ${source}`, source, default: def, names, loc };
  }

  serverFn(): ServerFnDecl {
    const loc = this.next().loc;
    this.expect("fn");
    const name = this.ident("a function name").v;
    const { params, defaults } = this.fnParams();
    return { kind: "ServerFn", name, params, ...(defaults.some(Boolean) ? { defaults } : {}), body: this.block(), loc };
  }

  // `(a, b: Number, c = 1)`: TypeScript-style annotations are accepted and dropped (the checker
  // infers types); defaults are kept.
  fnParams(): { params: string[]; defaults: (Expr | null)[] } {
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
    const t = this.ident("a type");
    if (t.v === "Function" || t.v === "void") t.v = t.v === "void" ? "Any" : "Fn";
    let list = false;
    if (this.is("[") && this.is("]", this.peek())) { this.i += 2; list = true; }
    const optional = this.eat("?");
    return { name: t.v, list, optional, loc: t.loc };
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
    if (page && this.eat("layout")) layoutName = this.ident("a layout name").v;
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
    this.skipSep();
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("'}'");
      if (this.memberAhead()) members.push(this.member());
      else view.push(this.viewNode());
      this.skipSep();
    }
    this.expect("}");
    return { kind: "Component", page, ...(layout ? { layout: true } : {}), name, path, ...(layoutName ? { layoutName } : {}), params, members, view, loc: kw.loc };
  }

  memberAhead(): boolean {
    if (this.is("state") || this.is("computed") || this.is("fn") || this.is("data")) return true;
    if (this.is("ref")) return this.peek().t === "id";
    return (this.is("mount") || this.is("effect")) && this.is("{", this.peek());
  }

  member(): Member {
    const kw = this.next();
    if (kw.v === "mount" || kw.v === "effect") {
      return { kind: kw.v === "mount" ? "Mount" : "Effect", name: kw.v, body: this.block(), loc: kw.loc };
    }
    const name = this.ident().v;
    if (kw.v === "ref") return { kind: "Ref", name, loc: kw.loc };
    if (kw.v === "state") {
      const type = this.eat(":") ? this.type() : null;
      this.expect("=");
      return { kind: "State", name, type, init: this.expr(), loc: kw.loc };
    }
    if (kw.v === "computed" || kw.v === "data") {
      this.expect("=");
      return { kind: kw.v === "data" ? "Data" : "Computed", name, expr: this.expr(), loc: kw.loc };
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
      nodes.push(this.viewNode());
      this.skipSep();
    }
    this.expect("}");
    return nodes;
  }

  viewNode(): ViewNode {
    const t = this.tok;
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
      return { kind: "ForView", item, index, list, ...(key ? { key } : {}), body: this.viewBlock(), loc: t.loc };
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
    const propAhead = () => this.tok.t === "id" && this.is("=", this.peek());
    const takesContent = !isComponent && !(spec && spec.content === null);

    if (takesContent && !atEnd() && !propAhead()) content = this.ternary();
    const readProps = () => {
      while (!atEnd()) {
        const p = this.ident("a prop (name=value) or flag");
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
      // LLMs often write props after the action (`-> dec() disabled=x`); accept it, fmt moves them first.
      readProps();
    }
    const children = this.is("{") ? this.viewBlock() : [];
    return { kind: "Element", tag: tag.v, content, props, action, children, loc: tag.loc };
  }

  // ---------- statements ----------
  block(): Stmt[] {
    this.expect("{");
    const out: Stmt[] = [];
    this.skipSep();
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("'}'");
      out.push(this.stmt());
      this.skipSep();
    }
    this.expect("}");
    return out;
  }

  stmt(): Stmt {
    const t = this.tok;
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
    if (this.is("try")) {
      this.next();
      const body = this.block();
      if (!this.keywordAhead("catch")) this.fail("'catch'");
      this.next();
      // `catch (e)`, `catch e` and a bare `catch` are all accepted.
      let param: string | null = null;
      if (this.eat("(")) { param = this.ident("an error name").v; this.expect(")"); }
      else if (this.tok.t === "id") param = this.next().v;
      return { kind: "Try", body, param, handler: this.block(), loc: t.loc };
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
    } else params.push(this.next().v);
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
      const prec = t.t === "op" ? BINARY_PREC[t.v] : undefined;
      if (prec === undefined || prec <= min) break;
      this.next();
      const right = this.binary(t.v === "**" ? prec - 1 : prec); // ** is right-associative
      left = { kind: "Binary", op: CANONICAL[t.v] ?? t.v, left, right, loc: left.loc };
    }
    return left;
  }

  unary(): Expr {
    const t = this.tok;
    if (t.t === "op" && (t.v === "!" || t.v === "-" || t.v === "+")) {
      this.next();
      return { kind: "Unary", op: t.v, arg: this.unary(), loc: t.loc };
    }
    if (this.is("typeof") || this.is("await")) {
      this.next();
      return { kind: "Unary", op: t.v, arg: this.unary(), loc: t.loc };
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
    if (t.t === "num") { this.next(); return { kind: "Num", value: Number(t.v), loc }; }
    if (t.t === "str") { this.next(); return { kind: "Str", value: t.v, loc }; }
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
        if (!this.eat(",")) break;
      }
      this.expect("]");
      return { kind: "Array", items, loc };
    }
    if (this.eat("{")) {
      const props: ObjProp[] = [];
      this.skipNl();
      while (!this.is("}")) {
        if (this.eat("...")) props.push({ spread: this.expr() });
        else {
          const k = this.tok;
          if (k.t !== "id" && k.t !== "str") this.fail("a property name");
          this.next();
          if (this.eat(":")) { this.skipNl(); props.push({ key: k.v, value: this.expr() }); }
          else props.push({ key: k.v, value: { kind: "Ident", name: k.v, loc: k.loc } });
        }
        this.skipNl();
        if (!this.eat(",")) break;
        this.skipNl();
      }
      this.skipNl();
      this.expect("}");
      return { kind: "Object", props, loc };
    }
    this.fail("an expression");
  }
}
