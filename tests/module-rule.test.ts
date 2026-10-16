// A local .ts/.js module imported with `use` that only holds data and functions could be ArtScript:
// `art check` says so as a warning (it doesn't block), with the fix.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyze, check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "art-modrule-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
const warnings = (dir: string, src: string) => analyze(parse(src, join(dir, "app.art"))).warnings.map((d) => d.type);

test("module rule: data, constants and formatters in a .ts file get a warning that doesn't block", () => {
  const dir = project({
    "lib/data.ts": 'export const PEOPLE = [{ name: "Ana" }];\nexport const money = (n: number) => `$${n.toFixed(2)}`;\n',
  });
  const src = 'use "./lib/data.ts" { PEOPLE, money }\n\npage P {\n  text money(PEOPLE.length)\n}\n';
  const file = join(dir, "app.art");
  assert.deepEqual(warnings(dir, src), ["MODULE_COULD_BE_ART"]);
  const [w] = analyze(parse(src, file)).warnings;
  assert.equal(w.severity, "warning");
  assert.equal(w.loc.line, 1);
  assert.match(w.fixes![0], /\.art/);
  assert.deepEqual(check(parse(src, file)), [], "not an error");
  const r = compile([{ file, src }]);
  assert.ok(r.js, "the app still compiles");
});

test("module rule: no warning for code that drives the DOM, runs every frame or defines a class", () => {
  const dir = project({
    "canvas.ts": "export function draw(c: HTMLCanvasElement) { c.getContext(\"2d\")!.fillRect(0, 0, 1, 1); }\n",
    "loop.ts": "export function start(step: () => void) { const tick = () => { step(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }\n",
    "dom.js": "export function focus(id) { document.getElementById(id)?.focus(); }\n",
    "engine.ts": "export class World { bodies: number[] = []; }\n",
    "map.ts": "export function mount(container: HTMLElement) { const o = new ResizeObserver(() => null); o.observe(container); }\n",
    "index.ts": 'export * from "./canvas.ts";\n',
  });
  for (const [mod, name] of [["canvas.ts", "draw"], ["loop.ts", "start"], ["dom.js", "focus"], ["engine.ts", "World"], ["map.ts", "mount"], ["index.ts", "draw"]]) {
    assert.deepEqual(warnings(dir, `use "./${mod}" { ${name} }\n\npage P {\n  text "x"\n}\n`), [], mod);
  }
  // npm packages are never flagged.
  assert.deepEqual(warnings(dir, 'use "esbuild" { version }\n\npage P {\n  text version\n}\n'), []);
});

test("module rule: no warning for a module a server fn uses, or one that configures a package and re-exports it", () => {
  const dir = project({
    "pricing.ts": "export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);\n",
    "lib.ts": 'import { transform } from "esbuild";\nexport const ready = true;\nexport { transform };\n',
  });
  // A server fn can't call a top-level fn yet: for code it shares, .ts is the way.
  assert.deepEqual(warnings(dir, 'use "./pricing.ts" { total }\n\nserver fn quote(xs) {\n  return total(xs)\n}\n\npage P {\n  text "x"\n}\n'), []);
  assert.deepEqual(warnings(dir, 'use "./lib.ts" { transform }\n\npage P {\n  text "x"\n}\n'), []);
});

test("module rule: art check --ai prints the warning with its severity and exits 0", () => {
  const dir = project({
    "src/app.art": 'use "./lib/util.ts" { greet }\n\npage P {\n  text greet("Ana")\n}\n',
    "src/lib/util.ts": "export const greet = (name: string) => `Hello, ${name}`;\n",
  });
  const r = spawnSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "check", join(dir, "src"), "--ai"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].type, "MODULE_COULD_BE_ART");
  assert.equal(lines[0].severity, "warning");
  assert.deepEqual(lines.at(-1), { ok: true });
  const human = spawnSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "check", join(dir, "src")], { encoding: "utf8" });
  assert.equal(human.status, 0);
  assert.match(human.stdout, /warning W\d+ MODULE_COULD_BE_ART/);
});
