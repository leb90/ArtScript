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

test("bad bodies are rejected", () => {
  assert.equal(fails("append Todos.draft\n  state x = 1")[0].type, "PATCH_BODY");
  assert.match(ok("append Todos/column\n  state x = 1"), /state x = 1/, "members appended to a view node join the component");
  assert.equal(fails("set Todos.draft gap=1")[0].type, "PATCH_BODY");
  assert.equal(fails("hola")[0].type, "PATCH_SYNTAX");
});

test("comments survive a patch (those of a replaced node go with it)", () => {
  const src = '// the app\npage P {\n  // the counter\n  state n = 0\n\n  column {\n    // shown first\n    text "a"\n    // replaced below\n    text "b"\n  }\n}\n';
  const out = ok('append P/column\n  // new\n  text "c"\nreplace P/column/text[1]\n  text "B"', [{ file: "app.art", src }]);
  assert.equal(out, '// the app\npage P {\n  // the counter\n  state n = 0\n\n  column {\n    // shown first\n    text "a"\n    text "B"\n    // new\n    text "c"\n  }\n}\n');
});

test("members inserted next to a view node or an unknown member just join the component (from the eval)", () => {
  const dir = "benchmarks/eval/projects/shop/artscript";
  const shop = ["shop.art", "components.art"].map((f) => ({ file: f, src: readFileSync(`${dir}/${f}`, "utf8") }));
  // Exactly what Claude wrote for shop-discount and shop-sort.
  const discount = applyPatch(shop, 'insert before Summary/row\n  computed discounted = total > 50\ninsert before Summary/row\n  computed finalTotal = total * 0.9\ninsert after Summary/row\n  if discounted {\n    text "Descuento 10%" muted\n  }');
  assert.deepEqual(discount.diagnostics, []);
  assert.match(discount.files["components.art"], /computed discounted = total > 50\n  computed finalTotal = total \* 0.9/);
  const sort = applyPatch(shop, 'replace Catalog.shown\n  computed shown = (sorted ? [...products].sort((a, b) => a.price - b.price) : products).filter(p => p.name.includes(query))\ninsert before Catalog.computed\n  state sorted = false');
  assert.deepEqual(sort.diagnostics, []);
  assert.match(sort.files["components.art"], /state sorted = false/);
  // Replacing a view node with members is still an error: the intent isn't clear.
  assert.equal(applyPatch(shop, "replace Summary/row\n  state x = 1").diagnostics[0].type, "PATCH_BODY");
});

test("paths may skip if/else/for wrappers when one node matches (from the eval)", () => {
  const dir = "benchmarks/eval/projects/shop/artscript";
  const shop = ["shop.art", "components.art"].map((f) => ({ file: f, src: readFileSync(`${dir}/${f}`, "utf8") }));
  // Claude wrote CartView/column/for/CartItemRow; the real path is CartView/if/else/column/for/CartItemRow.
  const r = applyPatch(shop, 'replace CartView/column/for/CartItemRow\n  CartItemRow item=item onChangeQty=onChangeQty');
  assert.deepEqual(r.diagnostics, []);
  // Ambiguous skips still fail and list the real paths.
  const src = [{ file: "a.art", src: 'page P {\n  state n = 0\n  if n == 0 {\n    text "a"\n  } else {\n    text "b"\n  }\n}\n' }];
  assert.equal(applyPatch(src, 'remove P/text').diagnostics[0].type, "TARGET_NOT_FOUND");
});

test("members written as view paths and paths through a child component still resolve", () => {
  // `Todos/fn/add`, `Todos/column/fn/add` and `Todos/add` all mean `Todos.add`.
  for (const target of ["Todos/fn/add", "Todos/column/fn/add", "Todos/add"]) {
    const out = ok(`replace ${target}\n  fn add() {\n    todos.push({ id: crypto.randomUUID(), title: draft.toUpperCase(), done: false })\n  }\n`);
    assert.match(out, /draft\.toUpperCase\(\)/);
  }
  assert.match(ok("replace Todos/state/draft\n  state draft = \"x\"\n"), /state draft = "x"/);
  // The only computed of the component.
  assert.match(ok("replace Todos/computed\n  computed pending = 0\n"), /computed pending = 0/);
  // Members appended at a view-ish path join the component.
  assert.match(ok("append Todos/state\n  state filter = \"all\"\n"), /state filter = "all"/);
  // A path that walks into a child component re-roots there.
  assert.match(ok("set Todos/column/for/TodoItem/row gap=9\n"), /row .*gap=9/);
  // Misses on member-like paths point to the members.
  const [d] = fails("replace Todos/fn/nope\n  fn nope() {\n  }\n");
  assert.ok(d.fixes!.includes("Todos.add"));
});

test("set Component adds, changes and removes props", () => {
  const out = ok("set TodoItem compact: Bool = false, label: String = \"x\"\n");
  assert.match(out, /component TodoItem\(todo: Todo, remove: Fn, compact: Bool = false, label: String = "x"\)/);
  assert.match(ok("set TodoItem -remove\nreplace TodoItem/row/button\n  text \"no remove\"\nset Todos/column/for/TodoItem -remove\n"), /component TodoItem\(todo: Todo\)/);
});

test("the patch example in docs/SPEC-EDIT.md applies to examples/todo", () => {
  const doc = readFileSync("docs/SPEC-EDIT.md", "utf8");
  const patch = /```patch\n([\s\S]*?)```/.exec(doc)![1];
  const out = ok(patch);
  assert.match(out, /title "My tasks"/);
  assert.match(out, /component TodoItem\(todo: Todo, remove: Fn, compact: Bool = false\)/);
});
