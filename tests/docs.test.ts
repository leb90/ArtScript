// Los ejemplos de la spec se compilan en cada test: la IA nunca debe aprender de código roto.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compile } from "../src/compile.ts";

const blocks = [...readFileSync("docs/SPEC.md", "utf8").matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

test("docs/SPEC.md: miembros + vista de ejemplo compilan sin errores", () => {
  const [decls, members, view] = blocks;
  const model = decls.slice(0, decls.indexOf("component"));
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
