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

test("fmt: examples are already canonical and fmt is idempotent", () => {
  for (const f of ["examples/counter/app.art", "examples/todo/app.art", "templates/default/src/app.art", "examples/users/app.art", "examples/notes/app.art", "examples/catalog/app.art"]) {
    const src = readFileSync(f, "utf8");
    const once = printProgram(parse(src, f));
    assert.equal(once, src, `${f} is not canonical (run: art fmt ${f} --write)`);
    assert.equal(printProgram(parse(once, f)), once);
  }
});

test("fmt: alternative forms converge to one", () => {
  const a = printProgram(parse('page P {\n  state x = 1\n  if x === 1 { text "a" }\n}', "t"));
  const b = printProgram(parse('page P {\n\n  state x = 1\n  if (x == 1) {\n    text "a"\n  }\n}', "t"));
  assert.equal(a, b);
});

test("context: project map with inferred types", () => {
  const { program, a } = todo();
  const map = projectMap(program, a);
  assert.match(map, /^model Todo \{ id: ID, title: String, done: Bool \}$/m);
  assert.match(map, /page Todos "\/" state\[todos: Todo\[\], draft: String\] computed\[pending: Number\] fn\[add\(\)\] uses\[TodoItem\]/);
});

test("context: with room for the source, only what the source doesn't say plus the source", () => {
  const { program, a } = todo();
  const out = declContext(program, a, "Todos/TodoItem")!;
  assert.match(out, /^component TodoItem\(todo: Todo, remove: Fn\) @/);
  assert.match(out, /^used_by: Todos$/m);
  assert.match(out, /^model Todo/m);
  assert.match(out, /button "x" danger small -> remove\(todo.id\)/);
  assert.doesNotMatch(out, /^(props|events|paths):/m, "nothing the source already shows");
});

test("context: --budget without room for the source gives a summary and the patch paths", () => {
  const { program, a } = todo();
  const full = declContext(program, a, "Todos")!;
  const small = declContext(program, a, "Todos", 120)!;
  assert.ok(estimateTokens(small) < estimateTokens(full));
  assert.match(small, /^state: todos: Todo\[\], draft: String$/m);
  assert.match(small, /^paths:$/m);
  assert.doesNotMatch(small, /fn add\(\) \{/);
});

test("errors --ai: one JSON line without empty fields", () => {
  const line = formatAI({ code: "E1001", type: "UNDEFINED_NAME", msg: "x", loc: { file: "a.art", line: 3, col: 8 }, expr: "cont", fixes: ["count"] });
  assert.equal(line, '{"code":"E1001","type":"UNDEFINED_NAME","loc":"a.art:3:8","expr":"cont","fixes":["count"]}');
});

test("suggest: never offers the same name as a fix", () => {
  assert.deepEqual(suggest("muted", ["muted", "mute", "bold"]), ["mute"]);
});
