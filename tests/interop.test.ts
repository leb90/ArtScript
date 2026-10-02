// `use`: npm packages and local JS/TS modules, checked at compile time and bundled by `art build`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
import { all, mountApp } from "./helpers.ts";

const FIXTURE = "tests/fixtures/interop/app.art";
const types = (src: string, file = "tests/fixtures/interop/x.art") => check(parse(src, file)).map((d) => d.type);
const errs = (src: string, file = "tests/fixtures/interop/x.art") => check(parse(src, file));

test("use: parse and print canonically", () => {
  const src = 'use "./lib/money.ts" as round { toUSD }\n\nuse "solid-js" { createSignal, For }\n';
  assert.equal(printProgram(parse(src, "t")), src);
});

test("use: local modules and npm packages are verified, with fixes", () => {
  assert.deepEqual(types('use "./lib/money.ts" { toUSD }\npage P {\n  text toUSD(1)\n}'), []);
  const [typo] = errs('use "./lib/money.ts" { toUsd }');
  assert.deepEqual([typo.type, typo.fixes], ["UNKNOWN_EXPORT", ["toUSD"]]);
  const [missing] = errs('use "date-fns-that-does-not-exist" { format }');
  assert.deepEqual([missing.type, missing.fixes], ["UNKNOWN_MODULE", ["npm install date-fns-that-does-not-exist"]]);
  const [path] = errs('use "./lib/nope.ts" { x }');
  assert.equal(path.type, "UNKNOWN_MODULE");
  // npm package from node_modules: named exports are checked too.
  assert.deepEqual(types('use "solid-js" { createSignal }'), []);
  assert.deepEqual(errs('use "solid-js" { createSignall }')[0].fixes, ["createSignal"]);
  // No default export: the fix suggests a named import.
  assert.equal(errs('use "solid-js" as Solid')[0].type, "UNKNOWN_EXPORT");
});

test("use: names are visible everywhere; same module twice is fine, a clash isn't", () => {
  assert.deepEqual(types('use "./lib/money.ts" { toUSD }\nserver fn price() {\n  return toUSD(2)\n}\ncomponent C {\n  text toUSD(1)\n}'), []);
  const a = { file: "tests/fixtures/interop/a.art", src: 'use "./lib/money.ts" { toUSD }\npage A {\n  text toUSD(1)\n}' };
  const b = { file: "tests/fixtures/interop/b.art", src: 'use "./lib/money.ts" { toUSD }\ncomponent B {\n  text toUSD(2)\n}' };
  assert.deepEqual(compile([a, b]).diagnostics, []);
  assert.deepEqual(types('use "./lib/money.ts" { toUSD }\nmodel toUSD {\n  id: ID\n}'), ["DUPLICATE_NAME"]);
});

test("use: imports in the app, and in server fns only what they mention", () => {
  const r = compile([{ file: "tests/fixtures/interop/x.art", src: 'use "./lib/money.ts" { toUSD }\nuse "solid-js" { createSignal }\nmodel T {\n  id: ID\n}\napi ts: T\nserver fn price() {\n  return toUSD(2)\n}\npage P {\n  text toUSD(1)\n}' }]);
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.js!, /import \{ toUSD \} from ".*\/tests\/fixtures\/interop\/lib\/money\.ts";/);
  assert.match(r.js!, /import \{ createSignal \} from "solid-js";/);
  assert.match(r.server!.fns, /import \{ toUSD \} from/);
  assert.doesNotMatch(r.server!.fns, /solid-js/, "client-only imports stay out of the server");
});

test("e2e: a local module's functions run in the page", async () => {
  const { root } = await mountApp(readFileSync(FIXTURE, "utf8").replace('"./lib/money.ts"', JSON.stringify(join(process.cwd(), "tests/fixtures/interop/lib/money.ts"))));
  const spans = () => all(root, "span").map((s) => s.textContent);
  assert.deepEqual(spans(), ["$2.50", "Total: $8.00"]);
  all(root, "button")[0].click();
  assert.deepEqual(spans(), ["$3.50", "Total: $11.00"]);
});

test("art build bundles the runtime and every used module into one minified app.js", () => {
  const out = mkdtempSync(join(tmpdir(), "art-build-"));
  execFileSync(process.execPath, ["src/cli.ts", "build", FIXTURE, "--out", out], { stdio: "pipe" });
  const app = readFileSync(join(out, "app.js"), "utf8");
  assert.doesNotMatch(app, /from\s*"/, "no imports left: everything is bundled");
  assert.match(app, /toFixed\(2\)/, "the local module is inside");
  assert.match(app, /export\{.*start.*\}/);
});

test("use: { name as local } renames an import", () => {
  const src = 'use "./lib/money.ts" { toUSD as usd }\n\npage P {\n  text usd(1)\n}\n';
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src), []);
  assert.deepEqual(types('use "./lib/money.ts" { toUSD as usd }\npage P {\n  text toUSD(1)\n}'), ["UNDEFINED_NAME"]);
  const [typo] = errs('use "./lib/money.ts" { toUsd as usd }');
  assert.deepEqual([typo.type, typo.fixes], ["UNKNOWN_EXPORT", ["toUSD"]]);
  const r = compile([{ file: "tests/fixtures/interop/x.art", src }]);
  assert.match(r.js!, /import \{ toUSD as usd \} from/);
});

test("art build: import() in a use module becomes a chunk loaded on demand", () => {
  const out = mkdtempSync(join(tmpdir(), "art-split-"));
  execFileSync(process.execPath, ["src/cli.ts", "build", "tests/fixtures/split/app.art", "--out", out], { stdio: "pipe" });
  const app = readFileSync(join(out, "app.js"), "utf8");
  assert.doesNotMatch(app, /HEAVY-MODULE-TEXT/);
  const chunk = /import\("\.\/(chunks\/[\w-]+\.js)"\)/.exec(app)?.[1];
  assert.ok(chunk, "app.js imports the chunk");
  assert.match(readFileSync(join(out, chunk!), "utf8"), /HEAVY-MODULE-TEXT/);
});
