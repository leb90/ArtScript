// `test "..." { }` blocks and `art test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
import { runTests } from "../src/testing.ts";

const types = (src: string) => check(parse(src, "t")).map((d) => d.type);

test("test blocks: canonical format and checked steps", () => {
  const src = 'page P {\n  text "hi"\n}\n\ntest "greets" {\n  open "/"\n  see "hi"\n  click "Add" 1\n  select 0 "Two"\n}\n';
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src), []);
  const [d] = check(parse('page P {\n  text "hi"\n}\ntest "x" {\n  sees "hi"\n}\n', "t"));
  assert.deepEqual([d.type, d.fixes], ["UNDEFINED_NAME", ["see"]]);
  assert.deepEqual(types('page P {\n  text "hi"\n}\ntest "x" {\n  fill "Name"\n}\n'), ["TYPE_MISMATCH"]);
});

test("art test: runs the examples' tests (one with a server and accounts)", async () => {
  for (const ex of ["todo", "crm"]) {
    const r = await runTests([{ file: "app.art", src: readFileSync(`examples/${ex}/app.art`, "utf8") }]);
    assert.ok(!("diagnostics" in r), JSON.stringify(r));
    assert.deepEqual((r as any[]).map((t) => [t.name, t.ok, t.error ?? ""]).filter((t) => !t[1]), []);
  }
  const bad = await runTests([{ file: "app.art", src: 'page P {\n  text "hi"\n}\n\ntest "wrong" {\n  see "bye"\n}\n' }]);
  assert.match((bad as any[])[0].error, /line 6: see: expected "bye"; the screen shows: "hi"/);
});
