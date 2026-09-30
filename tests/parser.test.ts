import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentDecl, Element } from "../src/ast.ts";
import { CompileError } from "../src/errors.ts";
import { lex } from "../src/lexer.ts";
import { parse, parseExpression } from "../src/parser.ts";
import { printExpr } from "../src/printer.ts";

const noLoc = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "loc" ? undefined : v)));

test("lexer: tokens básicos, operadores largos y saltos de línea", () => {
  const t = lex("count++ -> a === b\nx", "t").map((x) => x.v);
  assert.deepEqual(t, ["count", "++", "->", "a", "===", "b", "\n", "x", ""]);
});

test("lexer: saltos de línea dentro de ( ) y [ ] no terminan sentencia", () => {
  const t = lex("f(a,\n b)\n[1,\n2]", "t").filter((x) => x.t === "nl");
  assert.equal(t.length, 1);
});

test("lexer: string sin cerrar da error estructurado", () => {
  assert.throws(() => lex('text "hola', "t"), (e: CompileError) => e.diagnostic.type === "UNTERMINATED_STRING" && e.diagnostic.loc.col === 6);
});

test("expresiones: precedencia y asociatividad", () => {
  assert.equal(printExpr(parseExpression("a + b * c")), "a + b * c");
  assert.equal(printExpr(parseExpression("(a + b) * c")), "(a + b) * c");
  assert.equal(printExpr(parseExpression("a - (b - c)")), "a - (b - c)");
  assert.equal(printExpr(parseExpression("2 ** 3 ** 2")), "2 ** 3 ** 2");
  assert.equal(printExpr(parseExpression("a ?? b || c")), "a ?? b || c");
});

test("expresiones: === y !== se normalizan a la forma canónica", () => {
  assert.equal(printExpr(parseExpression("a === b && c !== d")), "a == b && c != d");
});

test("expresiones: arrows, objetos, spread, optional chaining, templates", () => {
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

test("parser: página con state, computed y vista", () => {
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

test("parser: component con params, if/else, for con índice, fn", () => {
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

test("parser: model con tipos lista y opcionales", () => {
  const p = parse("model User {\n  id: ID\n  tags: String[]\n  bio: String?\n}", "t");
  const m = p.decls[0] as any;
  assert.deepEqual(m.fields.map((f: any) => [f.name, f.type.name, f.type.list, f.type.optional]), [
    ["id", "ID", false, false], ["tags", "String", true, false], ["bio", "String", false, true],
  ]);
});

test("parser: error con ubicación, esperado y actual", () => {
  assert.throws(() => parse("page A {\n  state = 1\n}", "app.art"), (e: CompileError) => {
    const d = e.diagnostic;
    return d.type === "UNEXPECTED_TOKEN" && d.loc.line === 2 && d.expected === "un nombre" && d.actual === "'='";
  });
});
