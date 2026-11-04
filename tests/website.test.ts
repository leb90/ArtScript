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
      const tries = /^((page|component|layout|model|use|server|test|const|fn)\b|api \w+:|auth \w)/.test(code) ? [code] : [`page W "/w" {\n${code}\n}`, `page W "/w" {\n  fn w() {\n${code}\n  }\n}`];
      const errors = tries.map((src) => compile([{ file: "snippet.art", src }]).diagnostics.filter((d) => !CONTEXT.has(d.type) && !(d.type === "UNKNOWN_ELEMENT" && /component/.test(d.msg))));
      const best = errors.reduce((a, b) => (b.length < a.length ? b : a));
      for (const d of best) problems.push(`${f}: ${d.type}: ${d.msg}\n${code.split("\n").slice(0, 2).join("\n")}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("website: every guide linked as Markdown (/md/<file>) is copied there by the build", () => {
  const content = readFileSync("website/lib/content.ts", "utf8");
  const copied = /^cp (.*) site\/md\/$/m.exec(readFileSync("website/build.sh", "utf8"))![1].split(" ");
  const files = [...content.matchAll(/doc\("[^"]*", "[^"]*", "[^"]*", "[^"]*", "([^"]+\.md)"/g)].map((m) => m[1]);
  assert.ok(files.length > 10);
  assert.deepEqual(files.filter((f) => !copied.includes(f) && !(f.startsWith("website/content/") && copied.includes("website/content/*.md"))), []);
});

test("website: the Next.js table says what the result files say", () => {
  // In order, as the report merges them: a later file replaces the cells it has.
  const FILES: Record<string, string[]> = {
    "Sonnet 5.5": ["2026-10-02T17-07-31-claude-sonnet-5-5", "2026-11-04T16-50-49-claude-sonnet-5-5", "2026-11-04T17-02-59-claude-sonnet-5-5"],
    "Opus 5.5": ["2026-10-02T17-49-54-claude-opus-5-5", "2026-11-04T18-03-56-claude-opus-5-5"],
    "Haiku 4.5": ["2026-10-02T16-45-31-claude-haiku-4-5", "2026-10-02T17-35-30-claude-haiku-4-5", "2026-11-04T17-56-39-claude-haiku-4-5", "2026-11-04T17-56-58-claude-haiku-4-5"],
  };
  const cell = (rows: any[]) => {
    const ok = rows.filter((r) => r.ok).length;
    return { per: rows.reduce((a, r) => a + r.usd, 0) / ok, text: `$${(rows.reduce((a, r) => a + r.usd, 0) / ok).toFixed(4)} (${ok}/${rows.length})` };
  };
  const page = readFileSync("website/benchmarks.art", "utf8").replace(/\s+/g, " ");
  for (const [model, files] of Object.entries(FILES)) {
    const cells = new Map<string, any[]>();
    for (const file of files) {
      const rows = JSON.parse(readFileSync(`benchmarks/eval/results/${file}.json`, "utf8")).results.filter((r: any) => r.errors?.[0] !== "refusal" && !/^(API \d+|budget exhausted)/.test(r.errors?.[0] ?? ""));
      for (const key of new Set<string>(rows.map((r: any) => `${r.task}/${r.stack}`))) cells.set(key, rows.filter((r: any) => `${r.task}/${r.stack}` === key));
    }
    const all = [...cells.values()].flat();
    const groups: [string, (t: string) => boolean][] = [["All 50 tasks", () => true], ["Without a backend (41)", (t) => !t.startsWith("fs-")], ["Full-stack (9)", (t) => t.startsWith("fs-")]];
    for (const [tasks, keep] of groups) {
      const of = (stack: string) => cell(all.filter((r) => r.stack === stack && keep(r.task)));
      const art = of("artscript"), next = of("next");
      const row = `{ model: "${model}", tasks: "${tasks}", art: "${art.text}", next: "${next.text}", diff: "−${Math.round((1 - art.per / next.per) * 100)}%", react: "${of("react").text}" }`;
      assert.ok(page.includes(row), `benchmarks.art should have ${row}`);
    }
  }
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

test("website: every recipe is a whole program that compiles, and they work", async () => {
  const md = readFileSync("website/content/recipes.md", "utf8");
  const recipes = [...md.matchAll(/```art\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const src of recipes) {
    // Only npm packages that aren't installed in this repository may be missing.
    const errors = compile([{ file: "app.art", src }]).diagnostics.filter((d) => d.type !== "UNKNOWN_MODULE");
    assert.deepEqual(errors.map((d) => `${d.type}: ${d.msg}`), [], src.split("\n")[0]);
  }
  const run = async (i: number, steps: string) => {
    const r = await runTests([{ file: "app.art", src: `${recipes[i]}\ntest "recipe" {\n${steps}\n}\n` }]);
    assert.deepEqual(r, [{ name: `test "recipe"`, ok: true }], recipes[i].split("\n")[0]);
  };
  await run(0, '  fill "Name" "A"\n  fill "Email" "a@b.co"\n  click "Join"\n  see "at least"\n  fill "Name" "Ana"\n  click "Join"\n  see "Thanks"');
  await run(4, '  see "Comfortable"\n  check 0\n  see "Compact"');
  await run(5, '  click "Billing"\n  see "Your plan"');
});
