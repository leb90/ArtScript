// The website (website/, an ArtScript app) and its guides: everything compiles and the code in the
// docs is real. Also the compiler features the site depends on.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { compile } from "../src/compile.ts";
import { runTests } from "../src/testing.ts";

const sources = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".art")).map((f) => ({ file: join(dir, f), src: readFileSync(join(dir, f), "utf8") }));

test("website: every .art file compiles without errors", () => {
  const r = compile(sources("website"));
  assert.deepEqual(r.diagnostics.map((d) => `${d.loc.file}:${d.loc.line} ${d.type}: ${d.msg}`), []);
});

// A snippet may use names defined elsewhere in its guide; anything else is a real mistake.
const CONTEXT = new Set(["UNDEFINED_NAME", "UNKNOWN_TYPE", "UNKNOWN_MODULE", "AUTH_REQUIRED"]);

test("website: the ArtScript code in every guide is valid", () => {
  const problems: string[] = [];
  for (const f of readdirSync("website/content")) {
    const md = readFileSync(join("website/content", f), "utf8");
    for (const m of md.matchAll(/```art\n([\s\S]*?)```/g)) {
      const code = m[1];
      // A whole program, a component body (members and view), or statements of a fn.
      const tries = /^((page|component|layout|model|use|server|test)\b|api \w+:|auth \w)/.test(code) ? [code] : [`page W "/w" {\n${code}\n}`, `page W "/w" {\n  fn w() {\n${code}\n  }\n}`];
      const errors = tries.map((src) => compile([{ file: "snippet.art", src }]).diagnostics.filter((d) => !CONTEXT.has(d.type) && !(d.type === "UNKNOWN_ELEMENT" && /component/.test(d.msg))));
      const best = errors.reduce((a, b) => (b.length < a.length ? b : a));
      for (const d of best) problems.push(`${f}: ${d.type}: ${d.msg}\n${code.split("\n").slice(0, 2).join("\n")}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("website: the tutorial's final app passes its test", async () => {
  const r = await runTests(sources("tests/fixtures/tutorial"));
  assert.ok(!("diagnostics" in r), JSON.stringify(r));
  assert.deepEqual((r as any[]).filter((t) => !t.ok), []);
});

test("compiler: new, process in server fns, ref properties, and the same use in several files", () => {
  const ok = (files: Record<string, string>) => {
    const r = compile(Object.entries(files).map(([file, src]) => ({ file, src })));
    assert.deepEqual(r.diagnostics.map((d) => d.msg), []);
    return r.js!;
  };
  const js = ok({ "a.art": 'page P {\n  state year = 0\n  ref box\n\n  mount {\n    year = new Date(2020, 1).getFullYear()\n    box.innerHTML = "<b>hi</b>"\n  }\n  column ref=box\n}\n' });
  assert.match(js, /new Date\(2020, 1\)\.getFullYear\(\)/);
  ok({ "a.art": "server fn key() {\n  return process.env.KEY ?? \"\"\n}\n" });
  const two = ok({ "a.art": 'use "./tests/fixtures/interop/lib/money.ts" { toUSD }\n\npage A "/a" {\n  text toUSD(1)\n}\n', "b.art": 'use "./tests/fixtures/interop/lib/money.ts" { toUSD }\n\npage B "/b" {\n  text toUSD(2)\n}\n' });
  assert.equal(two.match(/import \{ toUSD \}/g)?.length, 1);
});
