import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compile } from "../src/compile.ts";

const src = `component Row(todo, onDone: Fn) {
  text todo.title
  button \`done \${todo.id}\` -> onDone(todo)
}

page P "/" {
  state todos = [{ id: 1, title: "a", done: false }, { id: 2, title: "b", done: false }]
  state draft = ""
  computed open = todos.filter(t => !t.done).length

  text \`open \${open}\` id="open"
  for t in todos key t.id {
    Row todo=t onDone=(x => x.done = true)
  }
}
`;

test("dev tools: only dev builds report to them", () => {
  const prod = compile([{ file: "app.art", src }]);
  assert.deepEqual(prod.diagnostics, []);
  assert.doesNotMatch(prod.js!, /devtools|\$inspect/);
  const dev = compile([{ file: "app.art", src }], { dev: true });
  assert.match(dev.js!, /import \{ \$inspect \} from "\.\/devtools\.js";/);
  assert.match(dev.js!, /\$inspect\("P", \{ params: \["prop", /);
});

test("dev tools: mounted components with live props, states and computed; a state can be set", async () => {
  const r = compile([{ file: "app.art", src }], { dev: true });
  const dir = mkdtempSync(join(tmpdir(), "art-devtools-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  for (const f of ["runtime.js", "devtools.js"]) copyFileSync(new URL(`../runtime/${f}`, import.meta.url), join(dir, f));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const art = (globalThis as any).__art;
    const snap = () => art.snapshot() as any[];
    assert.deepEqual(snap().map((c) => c.component), ["P", "Row", "Row"]);
    assert.equal(snap()[0].open, 2);
    assert.equal(snap()[0].draft, "");
    assert.deepEqual(snap()[1].todo, { id: 1, title: "a", done: false });
    assert.equal(snap()[1].onDone, "fn");
    [...document.querySelectorAll("button")].find((b) => b.textContent === "done 1")!.click();
    assert.equal(snap()[0].open, 1, "a computed follows an in-place change");
    assert.equal(snap()[1].todo.done, true);

    // The panel: closed it's a badge; open it lists the components and lets a state be changed.
    const shadow = document.getElementById("__art_devtools")!.shadowRoot!;
    assert.equal(shadow.querySelector(".badge")!.textContent, "◆ art");
    art.toggle();
    assert.match(shadow.querySelector(".panel")!.textContent!, /P.*state.*todos.*computed.*open.*1.*Row.*1 of 2/s);
    const original = globalThis.prompt;
    globalThis.prompt = () => "[]";
    try {
      [...shadow.querySelectorAll("button.val")].find((b) => b.previousSibling!.textContent === "todos")!.dispatchEvent(new Event("click"));
    } finally {
      globalThis.prompt = original;
    }
    assert.deepEqual(snap().map((c) => c.component), ["P"], "rows unmount when the list is emptied from the panel");
    assert.equal(document.getElementById("open")!.textContent, "open 0");
    art.toggle();
  } finally {
    await GlobalRegistrator.unregister();
  }
});
