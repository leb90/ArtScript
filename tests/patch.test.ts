import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyPatch, parsePatch } from "../src/patch.ts";

const TODO = () => [{ file: "app.art", src: readFileSync("examples/todo/app.art", "utf8") }];
const ok = (patch: string, src = TODO()) => {
  const r = applyPatch(src, patch);
  assert.deepEqual(r.diagnostics, []);
  return r.files["app.art"];
};
const fails = (patch: string, src = TODO()) => {
  const r = applyPatch(src, patch);
  assert.ok(r.diagnostics.length, "expected the patch to fail");
  assert.deepEqual(r.changed, []);
  return r.diagnostics;
};

test("parsePatch: ops, targets, args, bodies and body line numbers", () => {
  const ops = parsePatch("# comment\nreplace A/row\n\n  text \"x\"\n    text \"y\"\nset A/row gap=2 -wrap\nremove A.x\n");
  assert.deepEqual(ops.map((o) => [o.op, o.target, o.args, o.body, o.bodyLine]), [
    ["replace", "A/row", "", 'text "x"\n  text "y"', 4],
    ["set", "A/row", "gap=2 -wrap", "", 7],
    ["remove", "A.x", "", "", 9], // trailing blank line: no body, so its line is irrelevant
  ]);
});

test("replace, insert before/after and remove on view nodes", () => {
  const out = ok(`replace Todos/column/title
  title "Mis tareas"
insert before Todos/column/row
  text "arriba"
insert after Todos/column/row
  text "abajo"
remove Todos/column/if`);
  assert.match(out, /title "Mis tareas"\n    text "arriba"\n    row gap=2 \{[\s\S]*?\n    \}\n    text "abajo"/);
  assert.doesNotMatch(out, /No tasks/);
});

test("append: element children, else branch, component members and model fields", () => {
  const out = ok(`append Todos/column/row
  button "Limpiar" -> draft = ""
append Todos/column/if/else
  text "fin"
append Todos
  fn clearDone() {
    todos = todos.filter(t => !t.done)
  }
append Todo
  note: String?`);
  assert.match(out, /button "Limpiar" -> draft = ""\n    \}/);
  assert.match(out, /text `\$\{pending\} left` muted\n      text "fin"/);
  assert.match(out, /fn clearDone\(\) \{\n    todos = todos.filter\(t => !t.done\)\n  \}/);
  assert.match(out, /done: Bool\n  note: String\?\n\}/);
});

test("members and fields: replace, insert after, remove", () => {
  const out = ok(`replace Todos.draft
  state draft = "hola"
insert after Todos.draft
  state filter = ""
remove Todos.pending
replace Todos/column/if/else/text
  text "listo"
replace Todo.title
  name: String`, [{ file: "app.art", src: readFileSync("examples/todo/app.art", "utf8").replace(/todo\.title/g, "todo.name").replace("title: draft", "name: draft") }]);
  assert.match(out, /state draft = "hola"\n  state filter = ""/);
  assert.doesNotMatch(out, /computed pending/);
  assert.match(out, /name: String/);
});

test("set: adds, overwrites and removes props and flags", () => {
  const out = ok("set Todos/column/row gap=6 align=center\nset Todos/column/row/button danger -primary");
  assert.match(out, /row gap=6 align=center \{/);
  assert.match(out, /button "Add" danger -> add\(\)/);
});

test("add: new declarations, into a new file", () => {
  const r = applyPatch(TODO(), `add extra.art
  component Badge(n: Number) {
    text n bold
  }
append Todos/column
  Badge n=todos.length`);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.changed.sort(), ["app.art", "extra.art"]);
  assert.match(r.files["extra.art"], /^component Badge\(n: Number\) \{/);
});

test("errors: unknown and ambiguous paths suggest valid ones", () => {
  const [a] = fails('replace Todos/column/row/buton\n  button "x"');
  assert.equal(a.type, "TARGET_NOT_FOUND");
  assert.deepEqual(a.fixes, ["Todos/column/row/button"]);
  const src = [{ file: "app.art", src: 'page P {\n  row {\n    text "a"\n    text "b"\n  }\n}\n' }];
  const [b] = fails('remove P/row/text', src);
  assert.equal(b.type, "AMBIGUOUS_TARGET");
  assert.deepEqual(b.fixes, ["P/row/text[0]", "P/row/text[1]"]);
  assert.match(ok("remove P/row/text[1]", src), /text "a"\n  \}/);
});

test("atomic: a type error in the result changes nothing and points at the patch line", () => {
  const [d] = fails('append Todos/column\n  text nada');
  assert.equal(d.type, "UNDEFINED_NAME");
  assert.deepEqual([d.loc.file, d.loc.line], ["patch", 2]);
});

test("bad bodies and files with comments are rejected", () => {
  assert.equal(fails("append Todos.draft\n  state x = 1")[0].type, "PATCH_BODY");
  assert.equal(fails("append Todos/column\n  state x = 1")[0].type, "PATCH_BODY");
  assert.equal(fails("set Todos.draft gap=1")[0].type, "PATCH_BODY");
  assert.equal(fails("hola")[0].type, "PATCH_SYNTAX");
  const commented = [{ file: "app.art", src: "// nota\npage P {\n  text \"a\"\n}\n" }];
  assert.equal(fails('append P\n  text "b"', commented)[0].type, "PATCH_COMMENTS");
});
