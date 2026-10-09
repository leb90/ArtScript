// 0.3 interface: on:<event>, ref/mount/effect/cleanup, component children, keyed lists, responsive props.
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
import { printProgram } from "../src/printer.ts";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

test("checker: events, refs, hooks, children, responsive props", () => {
  const [ev] = check(parse('page P {\n  state q = ""\n  input q on:keydwn=(q = "")\n}', "t"));
  assert.deepEqual([ev.type, ev.fixes], ["UNKNOWN_PROP", ["on:keydown"]]);
  assert.deepEqual(types('page P {\n  state q = ""\n  input q on:keydown=(q = event.key)\n}'), []);
  assert.deepEqual(types('page P {\n  state c = 0\n  canvas ref=c\n}'), ["TYPE_MISMATCH"]); // `ref=` needs a name declared with `ref`
  assert.deepEqual(types('page P {\n  state c = 0\n  row ref=c\n}'), ["TYPE_MISMATCH"]);
  assert.deepEqual(types("page P {\n  ref box\n  mount {\n    box.focus()\n    cleanup {\n      console.log(1)\n    }\n  }\n\n  row ref=box\n}"), []);
  assert.deepEqual(types("page P {\n  fn f() {\n    cleanup {\n      console.log(1)\n    }\n  }\n\n  text \"x\"\n}"), ["BAD_CLEANUP"]);
  assert.deepEqual(types('component Box {\n  text "no slot"\n}\n\npage P {\n  Box {\n    text "child"\n  }\n}'), ["NO_CHILDREN"]);
  assert.deepEqual(types('component Box {\n  card {\n    slot\n  }\n}\n\npage P {\n  Box {\n    text "child"\n  }\n}'), []);
  assert.deepEqual(types("page P {\n  slot\n}"), ["LAYOUT_SLOT"]);
  assert.deepEqual(types("page P {\n  grid cols=1 md:cols=3 lg:gap=4 {\n    text \"a\"\n  }\n}"), []);
  assert.deepEqual(types("page P {\n  grid xs:cols=3 md:cols=(1 + 1) {\n    text \"a\"\n  }\n}"), ["UNKNOWN_PROP", "TYPE_MISMATCH"]);
});

test("printer keeps the new syntax canonical", () => {
  const src = `component Chart(points: Number[]) {
  ref canvas
  mount {
    let c = canvas.getContext("2d")
    cleanup {
      console.log(c)
    }
  }
  effect {
    console.log(points.length)
  }

  card on:mouseenter=(hover = true) md:pad=6 {
    slot
  }
  for p in points key p {
    text p
  }
}
`;
  assert.equal(printProgram(parse(src, "t")), src);
});

const APP = `component Panel(title: String) {
  card {
    title title
    slot
  }
}

page Home {
  state items = [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  state keys = ""
  state log = ""
  state n = 0
  state showTimer = true
  ref field

  fn rename() {
    let f = items.find(x => x.id == 1)
    if f {
      f.name = "A"
    }
  }
  mount {
    field.focus()
    log = log + "mounted;"
  }
  effect {
    let seen = n
    cleanup {
      log = log + \`clean\${seen};\`
    }
  }

  column {
    input keys ref=field on:keydown=(keys = keys + event.key)
    button "n" -> n++
    text log id="log"
    Panel title="Lista" {
      for it in items key it.id {
        row {
          text it.name
          input it.name
        }
      }
    }
    button "add" -> items.push({ id: 3, name: "c" })
    button "rename" -> rename()
    button "reverse" -> items = [...items].reverse()
    button "reload" -> items = items.map(x => ({ ...x }))
    if showTimer {
      Timer
    }
    button "hide" -> showTimer = false
    grid cols=1 md:cols=3 id="g" {
      text "x"
    }
  }
}

component Timer {
  mount {
    window.timerState = "on"
    cleanup {
      window.timerState = "off"
    }
  }

  text "timer"
}
`;

test("ui: events, refs, hooks with cleanup, children, keyed rows keep their DOM", async () => {
  const r = compile([{ file: "app.art", src: APP }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-ui-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/home" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    await new Promise((r) => setTimeout(r, 10));
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const click = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    const log = () => document.getElementById("log")!.textContent;
    const rows = () => [...document.querySelectorAll(".a-card .a-row")];

    // mount ran after the view: the ref is set and focused; the effect ran once
    const field = document.querySelector("input")!;
    assert.equal(document.activeElement, field);
    assert.equal(log(), "mounted;");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    assert.equal(field.value, "x");

    // effect cleanup runs before each re-run
    click("n");
    assert.equal(log(), "mounted;clean0;");

    // children render in the component's slot
    assert.match(document.querySelector(".a-card")!.textContent!, /^Lista/);
    assert.deepEqual(rows().map((x) => x.textContent), ["a", "b"]);

    // keyed rows: adding keeps the existing nodes; in-place mutation updates them
    const first = rows()[0];
    click("add");
    assert.equal(rows()[0], first);
    assert.deepEqual(rows().map((x) => x.textContent), ["a", "b", "c"]);
    click("rename");
    assert.equal(rows()[0], first);
    assert.equal(rows()[0].textContent, "A");
    assert.equal((rows()[0].querySelector("input") as HTMLInputElement).value, "A");

    // reorder moves rows; new objects with the same key keep the DOM too
    click("reverse");
    assert.deepEqual(rows().map((x) => x.textContent), ["c", "b", "A"]);
    assert.equal(rows()[2], first);
    click("reload");
    assert.equal(rows()[2], first);

    // unmounting a component runs its cleanup
    await tick();
    assert.equal((window as any).timerState, "on");
    click("hide");
    assert.equal((window as any).timerState, "off");

    // responsive classes with their media rule
    const g = document.getElementById("g")!;
    assert.deepEqual([...g.classList].sort(), ["a-cols-1", "a-grid", "a-md-cols-3"]);
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
    assert.match(css, /@media\(min-width:768px\)\{\.a-md-cols-3\.a-md-cols-3\.a-md-cols-3\{grid-template-columns:repeat\(3/);
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("typed callbacks: Fn(User) checks calls and types the arrow passed to it", () => {
  const M = "model User {\n  id: ID\n  name: String\n}\n\n";
  const C = "component Picker(onPick: Fn(User)) {\n  button \"x\" -> onPick({ id: \"1\", name: \"a\" })\n}\n\n";
  assert.equal(printProgram(parse(M + C, "t")), (M + C).trimEnd() + "\n");
  assert.deepEqual(types(M + C + 'page P {\n  state picked = ""\n  Picker onPick=(u => picked = u.name)\n}'), []);
  assert.deepEqual(types(M + C + 'page P {\n  state picked = ""\n  Picker onPick=(u => picked = u.nmae)\n}'), ["UNKNOWN_FIELD"]);
  assert.deepEqual(types(M + "component Picker(onPick: Fn(User)) {\n  button \"x\" -> onPick(3)\n}\n"), ["TYPE_MISMATCH"]);
});

test("named slots: header { } fills `slot header`, the rest the unnamed slot", async () => {
  const src = 'component Panel {\n  card {\n    row {\n      slot header\n    }\n    slot\n  }\n}\n\npage Home {\n  Panel {\n    header {\n      title "Top"\n    }\n    text "Body"\n  }\n}\n';
  assert.deepEqual(types(src), []);
  assert.deepEqual(types('component Panel {\n  slot header\n}\n\npage Home {\n  Panel {\n    text "x"\n  }\n}\n'), ["NO_CHILDREN"]);
  assert.deepEqual(types("layout Main {\n  slot\n  slot side\n}\n"), ["LAYOUT_SLOT"]);
  const r = compile([{ file: "app.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-slots-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/home" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const card = document.querySelector(".a-card")!;
    assert.equal(card.querySelector(".a-row")!.textContent, "Top");
    assert.equal(card.textContent, "TopBody");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("ui: links with children, tables with a tbody, text next to children", async () => {
  const src = `page P "/" {
  state n = 0
  state rows = [{ id: 1, label: "a" }]

  link to="/x" class="card-link" {
    card {
      text "Card"
    }
  }
  table {
    for r in rows key r.id {
      tr {
        td \`\${r.label} \${n}\` {
          button "inc" -> n++
        }
      }
    }
  }
}
`;
  assert.deepEqual(types(src), []);
  const r = compile([{ file: "app.art", src }]);
  const dir = mkdtempSync(join(tmpdir(), "art-ui2-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    assert.equal(document.querySelector("a.card-link > .a-card")?.textContent, "Card");
    assert.equal(document.querySelectorAll("table > tbody > tr").length, 1);
    const td = document.querySelector("td")!;
    assert.equal(td.textContent, "a 0inc");
    document.querySelector("button")!.click();
    assert.equal(td.textContent, "a 1inc", "the text updates and the button stays");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("parser: an element without content may start with on:event or md:prop", () => {
  const src = 'page P {\n  state n = 0\n\n  link on:click=n++ {\n    text "a"\n  }\n  grid md:cols=2 {\n    text "b"\n  }\n}\n';
  const el = (parse(src, "t").decls[0] as any).view[0];
  assert.equal(el.content, null);
  assert.equal(el.props[0].name, "on:click");
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src), []);
});

test("keyed lists: a swap moves only the swapped rows; unchanged text isn't rewritten", async () => {
  const src = `page P "/" {
  state rows = Array.from({ length: 10 }, (_, i) => ({ id: i, label: \`row \${i}\` }))

  button "swap" -> { let a = rows[1]; rows[1] = rows[8]; rows[8] = a }
  button "reverse" -> rows = [...rows].reverse()
  button "drop" -> rows = rows.filter(r => r.id != 4)
  button "touch" -> rows[0].label = "first"
  column {
    for r in rows key r.id {
      text r.label
    }
  }
}
`;
  const r = compile([{ file: "app.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-keyed-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const list = document.querySelector(".a-column")!;
    const spans = () => [...list.querySelectorAll("span")];
    const labels = () => spans().map((s) => s.textContent).join(",");
    const click = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    const record = async (action: () => void) => {
      const seen: MutationRecord[] = [];
      const mo = new MutationObserver((m) => seen.push(...m));
      mo.observe(list, { childList: true, subtree: true, characterData: true });
      action();
      await new Promise((ok) => setTimeout(ok, 0));
      mo.disconnect();
      return seen;
    };
    const before = spans();
    const moves = await record(() => click("swap"));
    assert.equal(labels(), "row 0,row 8,row 2,row 3,row 4,row 5,row 6,row 7,row 1,row 9");
    assert.ok(moves.filter((m) => m.addedNodes.length).length <= 6, `few moves (${moves.length} records)`);
    assert.equal(spans()[1], before[8], "rows keep their DOM");
    click("reverse");
    assert.equal(labels(), "row 9,row 1,row 7,row 6,row 5,row 4,row 3,row 2,row 8,row 0");
    click("drop");
    assert.equal(labels(), "row 9,row 1,row 7,row 6,row 5,row 3,row 2,row 8,row 0");
    const writes = await record(() => click("touch"));
    assert.equal(new Set(writes.map((m) => m.target)).size, 1, "only the changed row's text is written");
    assert.equal(spans()[0].textContent, "first");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("keyed lists: in-place changes always show (fields, nested lists, through parameters)", async () => {
  const src = `page P "/" {
  state rows = [{ id: 1, done: false, tags: ["a"] }, { id: 2, done: false, tags: [] }]

  fn finish(r) {
    r.done = true
  }

  button "tag" -> rows[1].tags.push("b")
  button "all" -> rows.forEach(r => r.done = true)
  button "one" -> finish(rows[0])
  button "undo" -> rows[0].done = false
  for r in rows key r.id {
    text \`\${r.id}:\${r.done}:\${r.tags.length}\`
  }
}
`;
  const r = compile([{ file: "app.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-inplace-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const text = () => [...document.querySelectorAll("span")].map((s) => s.textContent).join(" ");
    const click = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    assert.equal(text(), "1:false:1 2:false:0");
    click("tag");
    assert.equal(text(), "1:false:1 2:false:1", "a nested list");
    click("undo");
    click("one");
    assert.equal(text(), "1:true:1 2:false:1", "through a fn parameter");
    click("undo");
    click("all");
    assert.equal(text(), "1:true:1 2:true:1", "through an arrow parameter");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("in-place changes through a computed's items and through iteration callbacks", async () => {
  const src = `page P "/" {
  state todos = [{ id: 1, done: false }, { id: 2, done: false }, { id: 3, done: true }]
  state other = 0
  computed open = todos.filter(t => !t.done)

  button "all" -> open.forEach(t => t.done = true)
  button "reset" -> todos.forEach(t => t.done = false)
  text \`open \${open.length} other \${other}\` id="count"
  for t in open key t.id {
    button \`do \${t.id}\` -> t.done = true
  }
  for t in todos key t.id {
    text \`\${t.id}:\${t.done}\` class="row"
  }
}
`;
  const r = compile([{ file: "app.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  // The callback's item belongs to the state being iterated: only that state is notified.
  assert.match(r.js!, /todos\.v\.forEach\(\(\(t\) => \$\.\$m\(todos, /);
  // A computed's item may belong to any state: the runtime finds which one holds the object.
  assert.match(r.js!, /open\.v\.forEach\(\(\(t\) => \$\.\$mut\(t, /);
  const dir = mkdtempSync(join(tmpdir(), "art-computed-items-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const rows = () => [...document.querySelectorAll(".row")].map((s) => s.textContent).join(" ");
    const count = () => document.getElementById("count")!.textContent;
    const click = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    assert.equal(count(), "open 2 other 0");
    click("do 1");
    assert.equal(rows(), "1:true 2:false 3:true", "a row of a computed changes the state it came from");
    assert.equal(count(), "open 1 other 0");
    click("reset");
    assert.equal(rows(), "1:false 2:false 3:false");
    assert.equal(count(), "open 3 other 0");
    click("all");
    assert.equal(rows(), "1:true 2:true 3:true");
    assert.equal(count(), "open 0 other 0");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("tables render inside a block that scrolls sideways; an empty text is hidden from screen readers", () => {
  const src = 'page P "/" {\n  column {\n    table {\n      tr {\n        td "a"\n      }\n    }\n    text "" class="glyphicon"\n  }\n}\n';
  assert.deepEqual(types(src), []);
  const js = compile([{ file: "a.art", src }]).js!;
  assert.match(js, /const (\w+) = \$\.\$el\(\w+, "div", "a-scroll"\);\s+const \w+ = \$\.\$el\(\1, "table", "a-table"\);/);
  assert.match(js, /setAttribute\("aria-hidden", "true"\)/);
});

test("a11y: role on any element; a field without a label is named by its placeholder", () => {
  const src = 'page P {\n  state q = ""\n  state s = ""\n\n  column role="main" {\n    input q placeholder="Search"\n    input s label="Name" placeholder="Ana"\n  }\n}\n';
  assert.deepEqual(types(src), []);
  const js = compile([{ file: "a.art", src }]).js!;
  assert.match(js, /setAttribute\("role", "main"\)/);
  assert.equal(js.match(/aria-label/g)?.length, 1, "only the field without a label");
  assert.match(js, /setAttribute\("aria-label", "Search"\)/);
});

test("attributes and HTML tags: aria-*, data-*, tag=, style next to layout props, an icon's class", async () => {
  const src = `page P "/" {
  state open = false

  column tag=nav gap=2 style="--d: 40ms" aria-label="Main" data-step=2 id="nav" {
    title "Plans" tag=h1
    text "Body" tag=p
    button "Menu" aria-expanded=open aria-controls="panel" -> open = !open
    icon "check" class="mark" aria-hidden
    row style=(open ? "color: red" : "") gap=1 id="row"
  }
}
`;
  assert.deepEqual(types(src), []);
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src.replace("tag=h1", "tag=marquee")), ["TYPE_MISMATCH"]);
  const dir = mkdtempSync(join(tmpdir(), "art-attrs-"));
  writeFileSync(join(dir, "app.js"), compile([{ file: "app.art", src }]).js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    (await import(pathToFileURL(join(dir, "app.js")).href)).start(document.getElementById("app"));
    const nav = document.getElementById("nav")!;
    assert.equal(nav.tagName, "NAV");
    assert.equal(nav.style.gap, "8px", "style= keeps the gap");
    assert.equal(nav.style.getPropertyValue("--d"), "40ms");
    assert.equal(nav.getAttribute("aria-label"), "Main");
    assert.equal(nav.getAttribute("data-step"), "2");
    assert.equal(document.querySelector("h1")!.textContent, "Plans");
    assert.equal(document.querySelector("p")!.textContent, "Body");
    const button = document.querySelector("button")!;
    assert.equal(button.getAttribute("aria-expanded"), "false");
    button.click();
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(document.getElementById("row")!.style.color, "red");
    assert.equal(document.getElementById("row")!.style.gap, "4px");
    const icon = document.querySelector(".mark")!;
    assert.ok(icon.classList.contains("a-icon"));
    assert.equal(icon.getAttribute("aria-hidden"), "true");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("shared state: top-level state, computed and fn are one value for every component", async () => {
  const src = `state cart: Number[] = []

computed total = cart.reduce((a, b) => a + b, 0)

fn add(n) {
  cart.push(n)
}

layout Main {
  text \`cart \${cart.length} total \${total}\` id="head"
  slot
}

component Product(price: Number) {
  button \`add \${price}\` -> add(price)
}

page Home "/" {
  Product price=5
  Product price=7
  button "clear" -> cart = []
}
`;
  assert.deepEqual(types(src), []);
  assert.equal(printProgram(parse(src, "t")), src);
  // A shared name can't be used before it exists, and unknown names are still errors.
  assert.deepEqual(types(src.replace("add(price)", "ad(price)")), ["UNDEFINED_NAME"]);
  const dir = mkdtempSync(join(tmpdir(), "art-shared-"));
  writeFileSync(join(dir, "app.js"), compile([{ file: "app.art", src }]).js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    (await import(pathToFileURL(join(dir, "app.js")).href)).start(document.getElementById("app"));
    const head = () => document.getElementById("head")!.textContent;
    const click = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    assert.equal(head(), "cart 0 total 0");
    click("add 5");
    click("add 7");
    assert.equal(head(), "cart 2 total 12");
    click("clear");
    assert.equal(head(), "cart 0 total 0");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("codegen: a list's rows come from a template; a row with an if or a component keeps node-by-node code", () => {
  const js = (body: string) => compile([{ file: "t.art", src: `page P {\n  state xs = [{ id: 1, name: "a" }]\n  state sel = 0\n  for x in xs key x.id {\n${body}\n  }\n}` }]).js!;
  const plain = js(`    card class=(x.id == sel ? "on" : "") {\n      text x.name bold\n      button "Pick" small -> sel = x.id\n    }`);
  assert.match(plain, /const t\d+ = \$\.\$tpl\(\[\["div",\{"class":"a-card"\},\["span",\{"class":"a-bold"\}\],\["button",\{"class":"a-small","type":"button"\}, ?"Pick"\]\]\]\);/);
  assert.match(plain, /const e\d+ = \$\.\$clone\(t\d+\);\n\s+const e\d+ = e\d+\.firstChild;\n\s+const e\d+ = e\d+\.nextSibling;/);
  assert.match(plain, /f\d+\.appendChild\(e\d+\);/);
  assert.doesNotMatch(plain, /\$\.\$el\(f\d+/);
  const withIf = js(`    card {\n      if x.id == sel {\n        text "picked"\n      }\n    }`);
  assert.doesNotMatch(withIf, /\$tpl\(/);
  assert.match(withIf, /\$\.\$el\(f\d+, "div", "a-card"\)/);
});
