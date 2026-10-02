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

// ---------- from the pilot of the 1.0 measurement (2026-10-02): what three models wrote ----------

test("lists and objects with one item per line and no commas", () => {
  const src = 'page P "/" {\n  state rows = [\n    { id: 1, name: "a" }\n    { id: 2, name: "b" }\n  ]\n  fn add() {\n    rows.push({\n      id: 3\n      name: "c"\n    })\n  }\n\n  text rows.length\n}\n';
  assert.deepEqual(types(src), []);
  assert.match(printProgram(parse(src, "t")), /state rows = \[\{ id: 1, name: "a" \}, \{ id: 2, name: "b" \}\]/);
  assert.match(printProgram(parse(src, "t")), /rows\.push\(\{ id: 3, name: "c" \}\)/);
});

test("for loops in functions: over a list, and JavaScript's forms", async () => {
  const src = `page P "/" {
  state rows = [{ id: 1, done: false }, { id: 2, done: false }]
  state total = 0
  fn finish() {
    for r, i in rows {
      r.done = i == 0
    }
    for (const r of rows) {
      total += r.id
    }
    for (let i = 1; i <= 3; i++) {
      total += i
    }
  }

  button "go" -> finish()
  for r in rows key r.id {
    text \`\${r.id}:\${r.done}\`
  }
  text \`total \${total}\` id="total"
}
`;
  assert.deepEqual(types(src), []);
  const printed = printProgram(parse(src, "t"));
  assert.match(printed, /for r, i in rows \{/);
  assert.match(printed, /for r in rows \{\n      total \+= r\.id/);
  assert.match(printed, /for \(let i = 1; i <= 3; i\+\+\) \{/);
  assert.equal(printProgram(parse(printed, "t")), printed);
  const dir = mkdtempSync(join(tmpdir(), "art-for-"));
  writeFileSync(join(dir, "app.js"), compile([{ file: "app.art", src }]).js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    (await import(pathToFileURL(join(dir, "app.js")).href)).start(document.getElementById("app"));
    document.querySelector("button")!.click();
    assert.equal(document.getElementById("total")!.textContent, "total 9");
    assert.match(document.body.textContent!, /1:true2:false/);
  } finally {
    await GlobalRegistrator.unregister();
  }
  // Haiku's own form gets the fix.
  const bad = compile([{ file: "a.art", src: 'page P "/" {\n  fn f() {\n    for i = 1; i <= 3; i++ {\n    }\n  }\n}\n' }]);
  assert.deepEqual(bad.diagnostics, []);
});

test("members as models write them: fn without (), let, ref with a value, a computed with a block", () => {
  const src = 'page P "/" {\n  state n = 0\n  ref timer = null\n  let double = n * 2\n  computed label = {\n    if n > 1 { return "many" }\n    return "few"\n  }\n  fn reset {\n    n = 0\n    timer = null\n  }\n\n  title label bold\n  text double\n}\n';
  assert.deepEqual(types(src), []);
  const out = printProgram(parse(src, "t"));
  assert.match(out, /state timer = null/);
  assert.match(out, /computed double = n \* 2/);
  assert.match(out, /fn reset\(\) \{/);
  assert.match(out, /computed label = \(\(\) => \{/);
  assert.deepEqual(types(out), []);
});

test("a model and a page may share a name; auth users: User declares the api; with password is the default", () => {
  const src = 'model Product {\n  id: ID\n  name: String\n}\n\npage Product "/" {\n  state p: Product? = null\n\n  text (p?.name ?? "")\n}\n';
  assert.deepEqual(types(src), []);
  const auth = 'model User {\n  id: ID\n  email: Email\n  password: String\n}\n\nauth users: User with password\n\npage P "/" {\n  data me = auth.me()\n\n  text (me?.email ?? "")\n}\n';
  assert.deepEqual(types(auth), []);
  assert.match(printProgram(parse(auth, "t")), /api users: User\n\nauth users\n/);
});

test("the content after a prop; a statement in the view explains where it goes", () => {
  const src = 'page P "/" {\n  state url = { a: "/x.png" }\n\n  image alt="Photo" url.a width=20\n}\n';
  assert.deepEqual(types(src), []);
  assert.match(printProgram(parse(src, "t")), /image url\.a alt="Photo" width=20/);
  const r = compile([{ file: "a.art", src: 'page P "/" {\n  state me = 1\n\n  if me {\n    navigate("/")\n  }\n}\n' }]);
  assert.equal(r.diagnostics[0].type, "STATEMENT_IN_VIEW");
  assert.match(r.diagnostics[0].fixes![0], /^effect \{ navigate/);
});

test("an optional state narrowed by an early return still takes null", () => {
  const src = 'page P "/" {\n  state picked: File? = null\n  state name = ""\n  fn upload() {\n    if picked == null { return }\n    name = picked.name\n    picked = null\n  }\n\n  file picked\n  button "Up" -> upload()\n}\n';
  assert.deepEqual(types(src), []);
  // And after that assignment it may be null again.
  const after = src.replace("picked = null\n", "picked = null\n    name = picked.name\n");
  assert.deepEqual(types(after), ["POSSIBLY_EMPTY"]);
});

test("an app without pages shows its root component", () => {
  const js = compile([{ file: "a.art", src: 'component Row(n: Number) {\n  text n\n}\n\ncomponent App {\n  Row n=1\n}\n' }]).js!;
  assert.match(js, /routes = \[\{ path: "\/", comp: App \}\]/);
});

test("art patch: a path may name `else` without its `if`", () => {
  const src = 'component List(items: Number[]) {\n  if items.length == 0 {\n    text "Empty"\n  } else {\n    column {\n      for n in items {\n        text n\n      }\n    }\n  }\n}\n';
  const r = applyPatch([{ file: "a.art", src }], "set List/else/column/for/text bold");
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.files["a.art"], /text n bold/);
});

// ---------- from the Haiku run of the 1.0 measurement ----------

test("an action that names a function calls it; a prop takes an arrow without parentheses", async () => {
  const src = `component Row(onAdd: Fn) {
  button "row" -> onAdd(1, 2)
}

page P "/" {
  state n = 0
  fn inc {
    n++
  }

  button "go" -> inc
  Row onAdd=(a, b) => n += a + b
  text \`n \${n}\` id="n"
}
`;
  assert.deepEqual(types(src), []);
  const printed = printProgram(parse(src, "t"));
  assert.match(printed, /button "go" -> inc\(\)/);
  assert.match(printed, /Row onAdd=\(\(a, b\) => n \+= a \+ b\)/);
  const dir = mkdtempSync(join(tmpdir(), "art-call-"));
  writeFileSync(join(dir, "app.js"), compile([{ file: "app.art", src }]).js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    (await import(pathToFileURL(join(dir, "app.js")).href)).start(document.getElementById("app"));
    for (const b of document.querySelectorAll("button")) b.click();
    assert.equal(document.getElementById("n")!.textContent, "n 4");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("states without a value, inline object types, data with a literal, a typed let, a view block", () => {
  const src = 'page P "/" {\n  state picked: File?\n  state rows: Number[]\n  state cart: { id: String, qty: Number }[] = []\n  data products = [{ id: 1 }]\n  let total: Number = rows.length + cart.length + products.length\n\n  view {\n    text total\n    text (picked?.name ?? "")\n  }\n}\n';
  assert.deepEqual(types(src), []);
  const out = printProgram(parse(src, "t"));
  assert.match(out, /state picked: File\? = null/);
  assert.match(out, /state rows: Number\[\] = \[\]/);
  assert.match(out, /state products = \[\{ id: 1 \}\]/);
  assert.match(out, /computed total = /);
  assert.doesNotMatch(out, /view \{/);
});

test("${} in a plain string is a template; literals side by side are a list; a block computed returns its last expression", () => {
  const src = 'page P "/" {\n  state name = "Ana"\n  state kind = "a"\n  computed label = {\n    if name == "" {\n      "nobody"\n    } else {\n      name\n    }\n  }\n\n  title "Hi, ${name}!"\n  select kind options=["a" "b" "c"]\n  text label\n}\n';
  assert.deepEqual(types(src), []);
  const out = printProgram(parse(src, "t"));
  assert.match(out, /title `Hi, \$\{name\}!`/);
  assert.match(out, /options=\["a", "b", "c"\]/);
  assert.match(out, /return "nobody"/);
});

test("server fn inside a page is hoisted; a component named as a layout is one; a button takes children", () => {
  const src = 'model Vote {\n  id: ID\n  option: String\n  tags: String[]\n}\n\napi votes: Vote\n\ncomponent Shell {\n  state likes = 0\n\n  button -> likes++ {\n    icon "heart"\n  }\n  slot\n}\n\npage Poll "/" layout Shell {\n  data n = server.total()\n  server fn total() {\n    return db.votes.count()\n  }\n\n  button "Vote" -> api.votes.create({ option: "a" })\n  text (n ?? 0)\n}\n';
  const r = compile([{ file: "a.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.js!, /layouts: \[Shell\]/);
  assert.match(r.server!.fns, /async total\(/);
});

test("errors that say where things go: top-level state, let in the view, an api given a model", () => {
  const first = (src: string) => compile([{ file: "a.art", src }]).diagnostics[0];
  assert.match(first('state likes = 0\n\npage P "/" {\n  text likes\n}\n').fixes![1], /layout Main \{ state likes/);
  const inView = first('page P "/" {\n  state xs = [1]\n\n  for x in xs {\n    let y = x * 2\n    text y\n  }\n}\n');
  assert.equal(inView.type, "STATEMENT_IN_VIEW");
  assert.match(inView.fixes![0], /^computed y/);
  assert.match(first('model Note {\n  id: ID\n}\n\napi Note private\n').fixes![0], /^api notes: Note private/);
});

test("art patch: set with params separated by spaces after a colon", () => {
  const src = 'component Row(item: Any) {\n  text item.name\n}\n';
  const r = applyPatch([{ file: "a.art", src }], "set Row item: Any onRemove: Fn");
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.files["a.art"], /component Row\(item: Any, onRemove: Fn\)/);
});

// ---------- from the second Haiku run ----------

test("auth given the model; api, model and auth written inside a page; members written inside the view", () => {
  const src = 'model User {\n  id: ID\n  email: Email\n  password: String\n}\n\nauth User\n\npage P "/" {\n  model Note {\n    id: ID\n    text: String\n  }\n  api notes: Note\n  data me = auth.me()\n\n  column {\n    computed n = notes.length\n    data notes = api.notes.list()\n    text n\n    text (me?.email ?? "")\n  }\n}\n';
  const r = compile([{ file: "a.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(Object.keys(r.server!.apis).sort(), ["notes", "users"]);
  assert.equal(r.server!.auth, "users");
});

test("while, try/finally, an arrow without parameters, a component called like a function, an assigned ref", async () => {
  const src = `component Badge(label: String = "x", big: Bool = false) {
  text label id="badge"
}

page P "/" {
  state n = 0
  state busy = true
  ref timer
  fn run() {
    let i = 0
    while i < 3 {
      n += i
      i++
    }
    try {
      n += 10
    } catch (e) {
      n = -1
    } finally {
      busy = false
    }
    timer = 5
  }

  button "go" on:click=(=> run())
  Badge(label="hi", big)
  title \`n \${n} \${busy}\` danger id="n"
}
`;
  assert.deepEqual(types(src), []);
  const printed = printProgram(parse(src, "t"));
  assert.match(printed, /while i < 3 \{/);
  assert.match(printed, /\} finally \{/);
  assert.match(printed, /Badge label="hi" big=true/);
  assert.equal(printProgram(parse(printed, "t")), printed);
  const dir = mkdtempSync(join(tmpdir(), "art-while-"));
  writeFileSync(join(dir, "app.js"), compile([{ file: "app.art", src }]).js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    (await import(pathToFileURL(join(dir, "app.js")).href)).start(document.getElementById("app"));
    document.querySelector("button")!.click();
    assert.equal(document.getElementById("n")!.textContent, "n 13 false");
    assert.equal(document.getElementById("badge")!.textContent, "hi");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("a toast goes away when the user acts again", async () => {
  const src = 'page P "/" {\n  state name = ""\n\n  input name placeholder="Name"\n  button "Add" -> notify("Name required", "danger")\n}\n';
  const dir = mkdtempSync(join(tmpdir(), "art-toast-"));
  writeFileSync(join(dir, "app.js"), compile([{ file: "app.art", src }]).js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    (await import(pathToFileURL(join(dir, "app.js")).href)).start(document.getElementById("app"));
    document.querySelector("button")!.click();
    assert.match(document.body.textContent!, /Name required/);
    await new Promise((r) => setTimeout(r, 5));
    document.querySelector("input")!.dispatchEvent(new Event("input", { bubbles: true }));
    assert.doesNotMatch(document.body.textContent!, /Name required/);
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("an object literal passed as a prop compiles to valid JavaScript", async () => {
  const src = 'component Card(product: Any) {\n  text product.name\n}\n\npage P "/" {\n  Card product=({ id: 1, name: "Laptop" })\n}\n';
  const js = compile([{ file: "a.art", src }]).js!;
  const esbuild = await import("esbuild");
  await esbuild.transform(js, { loader: "js" }); // throws on a syntax error
  assert.match(js, /product: \(\) => \(\{/);
});
