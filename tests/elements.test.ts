// UI elements: select, radio, tabs, checkbox, textarea, file, modal, table, list, badge, labels.
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

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

test("checker: bound elements need a state, choices need options", () => {
  assert.deepEqual(types('page P {\n  state c = "a"\n  select c options=["a", "b"] label="Pick" -> console.log(c)\n}'), []);
  assert.deepEqual(types('page P {\n  state c = "a"\n  radio c\n}'), ["MISSING_PROP"]);
  assert.deepEqual(types("page P {\n  select\n}"), ["MISSING_PROP", "MISSING_PROP"]);
  assert.deepEqual(types('page P {\n  modal "x" {\n    text "hi"\n  }\n}'), ["NOT_BINDABLE"]);
  assert.deepEqual(types('page P {\n  state on = false\n  checkbox on label="On" bold\n}'), ["UNKNOWN_PROP"]);
  assert.deepEqual(types('page P {\n  video "/a.mp4" controls muted\n  spinner\n  divider\n}'), []);
});

const APP = `page Home {
  state size = "M"
  state qty = 2
  state color = ""
  state tab = "info"
  state agree = false
  state notes = ""
  state open = false
  state changes = 0
  state products = [{ id: 1, name: "Mesa" }, { id: 2, name: "Silla" }]

  column {
    select qty options=[1, 2, 3] label="Cantidad" -> changes++
    select color options=["rojo", "azul"] placeholder="Color"
    radio size options=["S", "M", "L"] label="Talle"
    tabs tab options=[{ value: "info", label: "Info" }, { value: "specs", label: "Specs" }]
    checkbox agree label="Acepto"
    textarea notes rows=3 label="Notas"
    text \`\${qty + 1} \${size} \${tab} \${agree} \${notes} \${color}\` id="out"
    badge "nuevo" success
    button "abrir" -> open = true
    modal open {
      text "en el modal"
      button "cerrar" -> open = false
    }
    table {
      tr {
        th "Nombre"
      }
      for p in products {
        tr {
          td p.name
        }
      }
    }
    list {
      item "uno"
      item "dos"
    }
  }
}
`;

test("elements behave in the DOM", async () => {
  const r = compile([{ file: "app.art", src: APP }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-elements-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/home" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    await new Promise((r) => setTimeout(r, 10));
    const $ = <T extends Element>(s: string) => document.querySelector<T>(s)!;
    const out = () => $("#out").textContent;

    // select keeps the option's type (Number), fires `->`, and has a label
    const [qty, color] = [...document.querySelectorAll("select")];
    assert.equal(qty.selectedIndex, 1);
    assert.equal(qty.closest("label")!.textContent!.startsWith("Cantidad"), true);
    qty.selectedIndex = 2;
    qty.dispatchEvent(new Event("change", { bubbles: true }));
    assert.match(out()!, /^4 M info false {2}$/);
    assert.equal(color.selectedIndex, 0, "placeholder selected while empty");
    assert.equal(color.options[0].disabled, true);

    // radio
    const radios = [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    assert.deepEqual(radios.map((x) => x.checked), [false, true, false]);
    radios[2].checked = true;
    radios[2].dispatchEvent(new Event("change", { bubbles: true }));
    assert.match(out()!, /^4 L info/);

    // tabs
    const tabs = [...document.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
    tabs[1].click();
    assert.match(out()!, /^4 L specs/);
    assert.equal(tabs[1].getAttribute("aria-selected"), "true");

    // checkbox + textarea
    const cb = $<HTMLInputElement>("input[type=checkbox]");
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
    const ta = $<HTMLTextAreaElement>("textarea");
    ta.value = "hola";
    ta.dispatchEvent(new Event("input"));
    assert.match(out()!, /specs true hola $/);

    // modal opens and closes from the state
    const dialog = $<HTMLDialogElement>("dialog");
    assert.equal(dialog.open, false);
    [...document.querySelectorAll("button")].find((b) => b.textContent === "abrir")!.click();
    assert.equal(dialog.open, true);
    [...document.querySelectorAll("button")].find((b) => b.textContent === "cerrar")!.click();
    assert.equal(dialog.open, false);

    // table, list, badge
    assert.deepEqual([...document.querySelectorAll("td")].map((x) => x.textContent), ["Mesa", "Silla"]);
    assert.deepEqual([...document.querySelectorAll("li")].map((x) => x.textContent), ["uno", "dos"]);
    assert.equal($(".a-badge.a-success").textContent, "nuevo");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("notify: a toast that goes away, and the name can be the app's own", async () => {
  assert.deepEqual(types('page P {\n  button "x" -> notify("Saved", "success")\n}'), []);
  assert.deepEqual(types('page P {\n  fn notify(m) {\n    console.log(m)\n  }\n\n  button "x" -> notify("own")\n}'), []);
  assert.deepEqual(types('page P {\n  button "x" -> notify(3)\n}'), ["TYPE_MISMATCH"]);
  const r = compile([{ file: "app.art", src: 'page P {\n  button "save" -> notify("Saved", "success")\n}\n' }]);
  const dir = mkdtempSync(join(tmpdir(), "art-notify-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    document.querySelector("button")!.click();
    const toast = document.querySelector(".a-toast.a-success")!;
    assert.equal(toast.textContent, "Saved");
    assert.equal(document.querySelector(".a-toasts")!.getAttribute("aria-live"), "polite");
  } finally {
    await GlobalRegistrator.unregister();
  }
});
