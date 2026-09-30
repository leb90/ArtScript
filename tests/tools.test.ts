import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyze } from "../src/checker.ts";
import { parseProject } from "../src/compile.ts";
import { declContext, estimateTokens, projectMap } from "../src/context.ts";
import { formatAI, suggest } from "../src/errors.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";

const todo = () => {
  const { program } = parseProject([{ file: "app.art", src: readFileSync("examples/todo/app.art", "utf8") }]);
  return { program, a: analyze(program) };
};

test("fmt: los ejemplos ya están en formato canónico y es idempotente", () => {
  for (const f of ["examples/counter/app.art", "examples/todo/app.art", "templates/default/src/app.art"]) {
    const src = readFileSync(f, "utf8");
    const once = printProgram(parse(src, f));
    assert.equal(once, src, `${f} no está en formato canónico (correr: art fmt ${f} --write)`);
    assert.equal(printProgram(parse(once, f)), once);
  }
});

test("fmt: formas alternativas convergen a una sola", () => {
  const a = printProgram(parse('page P {\n  state x = 1\n  if x === 1 { text "a" }\n}', "t"));
  const b = printProgram(parse('page P {\n\n  state x = 1\n  if (x == 1) {\n    text "a"\n  }\n}', "t"));
  assert.equal(a, b);
});

test("context: mapa del proyecto con tipos inferidos", () => {
  const { program, a } = todo();
  const map = projectMap(program, a);
  assert.match(map, /^model Todo \{ id: ID, title: String, done: Bool \}$/m);
  assert.match(map, /page Todos "\/" state\[todos: Todo\[\], draft: String\] computed\[pending: Number\] fn\[add\(\)\] uses\[TodoItem\]/);
});

test("context: detalle de componente con dependencias, uso y eventos", () => {
  const { program, a } = todo();
  const out = declContext(program, a, "Todos/TodoItem")!;
  assert.match(out, /^props: todo: Todo, remove: Fn$/m);
  assert.match(out, /^used_by: Todos$/m);
  assert.match(out, /^model Todo/m);
  assert.match(out, /button "x" -> remove\(todo.id\)/);
  assert.match(out, /^source:$/m);
});

test("context: --budget recorta a outline y luego a líneas", () => {
  const { program, a } = todo();
  const full = declContext(program, a, "Todos")!;
  const small = declContext(program, a, "Todos", 120)!;
  assert.ok(estimateTokens(small) < estimateTokens(full));
  assert.doesNotMatch(small, /^source:$/m);
});

test("errores --ai: una línea JSON sin campos vacíos", () => {
  const line = formatAI({ code: "E1001", type: "UNDEFINED_NAME", msg: "x", loc: { file: "a.art", line: 3, col: 8 }, expr: "cont", fixes: ["count"] });
  assert.equal(line, '{"code":"E1001","type":"UNDEFINED_NAME","loc":"a.art:3:8","expr":"cont","fixes":["count"]}');
});

test("suggest: never offers the same name as a fix", () => {
  assert.deepEqual(suggest("muted", ["muted", "mute", "bold"]), ["mute"]);
});
