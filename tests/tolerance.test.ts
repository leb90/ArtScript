// What LLMs write out of habit (TS/JS/Svelte idioms and `art patch` variants), measured in the eval:
// each case here failed for a real model answer before being accepted.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { applyPatch } from "../src/patch.ts";
import { printProgram } from "../src/printer.ts";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

test("syntax: typed and default fn params, untyped component props, expressions in props", () => {
  const src = 'component Row(item, compact = false) {\n  text item.name muted=compact == true\n}\n\npage P {\n  state xs = [{ id: 1, name: "a" }]\n  fn remove(id: Number, all = false) {\n    xs = xs.filter((x: Any) => all || x.id != id)\n  }\n\n  for x in xs {\n    Row item=x\n  }\n  button "x" disabled=xs.length == 0 -> remove(1)\n}\n';
  assert.deepEqual(types(src), []);
  // Annotations are dropped, defaults kept, comparisons in props parenthesized.
  const out = printProgram(parse(src, "t"));
  assert.match(out, /fn remove\(id, all = false\)/);
  assert.match(out, /component Row\(item: Any, compact: Bool = false\)/);
  assert.match(out, /disabled=\(xs\.length == 0\)/);
});

const SHOP = `model Product {
  id: Number
  name: String
  stock: Number
}

component Card(product: Product, onAdd: Fn) {
  row {
    text product.name
    text \`\${product.stock}\` id=\`s\${product.id}\`
    button "Add" -> onAdd(product)
  }
}

component Editor(items: Product[]) {
  button "drop" -> items = items.filter(p => p.id != 1)
}

page Shop {
  state products: Product[] = [{ id: 1, name: "a", stock: 2 }, { id: 2, name: "b", stock: 5 }]
  computed shown = products.filter(p => p.stock > 0)
  fn add(p) {
    p.stock--
  }

  column {
    for p in shown {
      Card product=p onAdd=add
    }
    button "sort" -> shown = [...shown].reverse()
    Editor items=products
    text \`\${products.length}\` id="count"
  }
}
`;

test("semantics: param mutation updates the screen, computed can be assigned, props bind two-way", async () => {
  const r = compile([{ file: "app.art", src: SHOP }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-tol-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const btn = (label: string, i = 0) => [...document.querySelectorAll("button")].filter((b) => b.textContent === label)[i];
    const names = () => [...document.querySelectorAll(".a-row span:first-child")].map((x) => x.textContent);

    btn("Add").click(); // fn add(p) { p.stock-- }: p is a parameter, the screen still updates
    assert.equal(document.getElementById("s1")!.textContent, "1");
    btn("Add").click();
    assert.deepEqual(names(), ["b"], "the computed recomputes after the mutation");

    btn("sort").click(); // assigning a computed overrides it
    assert.deepEqual(names(), ["b"]);

    btn("drop").click(); // Editor assigns its prop: the parent's state changes
    assert.equal(document.getElementById("count")!.textContent, "1");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("a mutation inside a computed doesn't loop", () => {
  assert.deepEqual(compile([{ file: "a.art", src: "page P {\n  state xs = [3, 1]\n  computed f = xs.filter(x => x > 0)\n  computed s = f.sort()\n\n  text `${s}`\n}\n" }]).diagnostics, []);
});

const APP = () => [{ file: "app.art", src: SHOP }];
const ok = (patch: string) => {
  const r = applyPatch(APP(), patch);
  assert.deepEqual(r.diagnostics, []);
  return r.files["app.art"];
};

test("art patch accepts the variants models write", () => {
  // file prefix, dotted member keyword, name after the member keyword
  assert.match(ok("replace app.art/Shop/fn/add\n  fn add(p) {\n    p.stock -= 2\n  }\n"), /p\.stock -= 2/);
  assert.match(ok("replace Shop.fn.add\n  fn add(p) {\n    p.stock -= 3\n  }\n"), /p\.stock -= 3/);
  assert.match(ok("replace Shop/computed shown\n  computed shown = products\n"), /computed shown = products\n/);
  // `set` with a body is a replace; a member added with an existing name replaces it
  assert.match(ok("set Shop/computed shown\n  state shown = products\n"), /state shown = products/);
  const twice = ok("append Shop\n  state shown = []\n");
  assert.equal(twice.match(/(state|computed) shown =/g)!.length, 1);
  // `replace Component` with members only merges them
  assert.match(ok("replace Shop\n  state extra = 1\n"), /state extra = 1[\s\S]*column/);
  // the signature on the operation line
  assert.match(ok("replace Card(product: Product, onAdd: Fn, big: Bool = false)\n  row {\n    text product.name large=big\n    button \"Add\" -> onAdd(product)\n  }\n"), /component Card\(product: Product, onAdd: Fn, big: Bool = false\)/);
  // set fields on a model
  assert.match(ok("set Product price: Number?\n"), /price: Number\?/);
  // a path that skips intermediate elements when only one node matches
  assert.match(ok("set Shop/text muted\n"), /text `\$\{products\.length\}` id="count" muted/);
});

test("braces in a plain string with a known name suggest a template", () => {
  const [d] = check(parse('page P {\n  state total = 1\n  text "Total: {total}"\n}', "t"));
  assert.equal(d.type, "TEXT_BRACES");
  assert.deepEqual(d.fixes, ["`Total: ${total}`"]);
  assert.deepEqual(types('page P {\n  text "JSON looks like {a: 1}"\n}'), []);
});

test("art patch: braced op bodies and a header-only body", () => {
  assert.match(ok("replace Shop/column/text {\n  text \"x\" id=\"count\"\n}\n"), /text "x" id="count"/);
  const out = ok("replace Card\n  component Card(product: Product, onAdd: Fn, big: Bool = false) {\n");
  assert.match(out, /component Card\(product: Product, onAdd: Fn, big: Bool = false\) \{\n  row/);
});

test("TS function types, props without commas, one-line if", () => {
  // Parsed as Fn; they're required, so the checker asks for them where Card is used.
  const r = applyPatch(APP(), "set Card onRemove: (id: Number) => void, onPick: () => void, cb: Function\n");
  assert.deepEqual(r.diagnostics.map((d) => d.expected), ["onRemove: Fn", "onPick: Fn", "cb: Fn"]);
  const r2 = applyPatch(APP(), "set Card big: Bool extra\n");
  assert.deepEqual(r2.diagnostics.map((d) => d.expected), ["big: Bool", "extra: Any"]);
  assert.deepEqual(types('page P {\n  state n = ""\n  fn go() {\n    if n.trim() == "" return\n    n = "x"\n  }\n\n  text n\n}'), []);
});

test("every syntax error of a file is reported in one compile", () => {
  const src = 'model A {\n  id: ID\n  n: = 3\n}\n\ncomponent C {\n  text "ok"\n  button "x" -> )\n  row gap= {\n  }\n  text "still parsed"\n}\n\npage P {\n  state x = \n  text "y"\n}\n';
  const r = compile([{ file: "a.art", src }]);
  assert.deepEqual(r.diagnostics.map((d) => d.loc.line), [3, 8, 15]);
  assert.ok(r.diagnostics.every((d) => d.type === "UNEXPECTED_TOKEN"));
});
