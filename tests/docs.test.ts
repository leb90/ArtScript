// Spec examples are compiled on every test run: the AI must never learn from broken code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compile } from "../src/compile.ts";
import { applyPatch } from "../src/patch.ts";

const blocks = [...readFileSync("docs/SPEC.md", "utf8").matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

test("docs/SPEC.md: the member and view examples compile without errors", () => {
  const find = (start: string) => blocks.find((b) => b.startsWith(start))!;
  const [decls, members, apiDecl, view] = [find("model User"), find("state count"), find("api users"), find("column gap=4")];
  const model = decls.slice(0, decls.indexOf("component")) + apiDecl;
  const src = `${model}
component UserCard(user: User, onDelete: Fn, big: Bool = false) {
  text user.name
}

page Users "/users" {
  state draft = ""
${members}
${view}}
`;
  const r = compile([{ file: "SPEC.md", src }]);
  assert.deepEqual(r.diagnostics, []);
  assert.ok(r.js);
});

test("docs/SPEC.md: the art patch example applies cleanly to examples/todo", () => {
  const patch = /```patch\n([\s\S]*?)```/.exec(readFileSync("docs/SPEC.md", "utf8"))![1];
  const r = applyPatch([{ file: "app.art", src: readFileSync("examples/todo/app.art", "utf8") }], patch);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.changed, ["app.art"]);
});
