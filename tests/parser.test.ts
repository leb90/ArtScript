import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentDecl, Element } from "../src/ast.ts";
import { CompileError } from "../src/errors.ts";
import { lex } from "../src/lexer.ts";
import { parse, parseExpression } from "../src/parser.ts";
import { printExpr } from "../src/printer.ts";

const noLoc = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "loc" ? undefined : v)));

test("lexer: basic tokens, long operators and newlines", () => {
  const t = lex("count++ -> a === b\nx", "t").map((x) => x.v);
  assert.deepEqual(t, ["count", "++", "->", "a", "===", "b", "\n", "x", ""]);
});

test("lexer: newlines inside ( ) and [ ] don't end a statement", () => {
  const t = lex("f(a,\n b)\n[1,\n2]", "t").filter((x) => x.t === "nl");
  assert.equal(t.length, 1);
});

test("lexer: an unterminated string gives a structured error", () => {
  assert.throws(() => lex('text "hola', "t"), (e: CompileError) => e.diagnostic.type === "UNTERMINATED_STRING" && e.diagnostic.loc.col === 6);
});

test("expressions: precedence and associativity", () => {
  assert.equal(printExpr(parseExpression("a + b * c")), "a + b * c");
  assert.equal(printExpr(parseExpression("(a + b) * c")), "(a + b) * c");
  assert.equal(printExpr(parseExpression("a - (b - c)")), "a - (b - c)");
  assert.equal(printExpr(parseExpression("2 ** 3 ** 2")), "2 ** 3 ** 2");
  assert.equal(printExpr(parseExpression("a ?? b || c")), "a ?? b || c");
});

test("expressions: === and !== are normalized to the canonical form", () => {
  assert.equal(printExpr(parseExpression("a === b && c !== d")), "a == b && c != d");
});

test("expressions: arrows, objects, spread, optional chaining, templates", () => {
  for (const src of [
    "xs.filter(t => !t.done).length",
    "(a, b) => a + b",
    "{ id: 1, title, ...rest }",
    "user?.profile?.name ?? \"anon\"",
    "`Hola ${user.name}!`",
    "[...xs, { a: 1 }]",
    "cond ? a : b",
  ]) assert.equal(printExpr(parseExpression(src)), src);
});

test("parser: page with state, computed and view", () => {
  const p = parse(`page Counter "/" {
  state count = 0
  computed double = count * 2
  row gap=4 align=center {
    button "-" -> count--
    text count bold
  }
}`, "t");
  const c = p.decls[0] as ComponentDecl;
  assert.equal(c.page, true);
  assert.equal(c.path, "/");
  assert.deepEqual(c.members.map((m) => m.kind + ":" + m.name), ["State:count", "Computed:double"]);
  const row = c.view[0] as Element;
  assert.equal(row.tag, "row");
  assert.equal(row.content, null);
  assert.deepEqual(row.props.map((p) => p.name), ["gap", "align"]);
  const [btn, txt] = row.children as Element[];
  assert.deepEqual(noLoc(btn.content), { kind: "Str", value: "-" });
  assert.equal(btn.action![0].kind, "ExprStmt");
  assert.deepEqual(txt.props, [{ name: "bold", value: null, loc: txt.props[0].loc }]);
});

test("parser: component with params, if/else, for with index, fn", () => {
  const p = parse(`component List(items: Item[], title: String = "x") {
  fn clear() {
    items = []
  }
  for it, i in items {
    if i == 0 { text it.name } else { text "-" }
  }
}`, "t");
  const c = p.decls[0] as ComponentDecl;
  assert.deepEqual(c.params.map((x) => [x.name, x.type.list, x.default !== null]), [["items", true, false], ["title", false, true]]);
  assert.equal(c.view[0].kind, "ForView");
  const f = c.view[0] as any;
  assert.equal(f.index, "i");
  assert.equal(f.body[0].kind, "IfView");
  assert.equal(f.body[0].else.length, 1);
});

test("parser: model with list and optional types", () => {
  const p = parse("model User {\n  id: ID\n  tags: String[]\n  bio: String?\n}", "t");
  const m = p.decls[0] as any;
  assert.deepEqual(m.fields.map((f: any) => [f.name, f.type.name, f.type.list, f.type.optional]), [
    ["id", "ID", false, false], ["tags", "String", true, false], ["bio", "String", false, true],
  ]);
});

test("parser: error with location, expected and actual", () => {
  assert.throws(() => parse("page A {\n  state = 1\n}", "app.art"), (e: CompileError) => {
    const d = e.diagnostic;
    return d.type === "UNEXPECTED_TOKEN" && d.loc.line === 2 && d.expected === "a name" && d.actual === "'='";
  });
});

test("parser: a line starting with ? : . && || ?? continues the expression", () => {
  const p = parse(`page P {
  state tab = "a"
  text tab == "a"
    ? "Perfil"
    : "Ajustes"
  text [1, 2, 3]
    .filter(x => x > 1)
    .length
  if tab == "a"
    && tab != "b" {
    text "ok"
  }
}`, "t");
  const c = p.decls[0] as ComponentDecl;
  assert.equal(c.view.length, 3);
  assert.equal(printExpr((c.view[0] as Element).content!), 'tab == "a" ? "Perfil" : "Ajustes"');
  assert.equal(printExpr((c.view[1] as Element).content!), "[1, 2, 3].filter(x => x > 1).length");
});

test("lexer: spread at the start of a line is not a continuation", () => {
  const p = parse("page P {\n  state a = [1]\n  state b = [\n    ...a\n  ]\n}", "t");
  assert.equal((p.decls[0] as ComponentDecl).members.length, 2);
});

test("parser: props and flags after the action are accepted and printed first", () => {
  const src = 'page P {\n  state n = 0\n  button "-" -> n-- disabled=(n <= 0) small\n}';
  const el = (parse(src, "t").decls[0] as ComponentDecl).view[0] as Element;
  assert.deepEqual(el.props.map((p) => p.name), ["disabled", "small"]);
  assert.equal(el.action!.length, 1);
});
