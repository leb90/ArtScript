// `style { }` in a component: CSS scoped to its elements.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { compile } from "../src/compile.ts";
import { scopeCss } from "../src/css.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";

test("scopeCss: the last compound of every selector, inside @media too", () => {
  assert.equal(scopeCss(".box { color: red }", "C"), '.box[data-s="C"]{color: red}');
  assert.equal(scopeCss(".list > li a:hover, .x::before { x: 1 }", "C"), '.list > li a[data-s="C"]:hover,.x[data-s="C"]::before{x: 1}');
  assert.equal(scopeCss("@media (min-width: 600px) { .box { y: 2 } }", "C"), '@media (min-width: 600px){.box[data-s="C"]{y: 2}}');
  assert.equal(scopeCss("@keyframes spin { to { transform: rotate(1turn) } }", "C"), "@keyframes spin{ to { transform: rotate(1turn) } }");
});

const SRC = `component Card(label: String) {
  style {
    .box {
      border: 2px solid red;
    }
    .box:hover { color: #e11d48; }
  }

  card class="box" {
    text label
  }
}

page P {
  Card label="scoped"
  card class="box" {
    text "outside"
  }
}
`;

test("style: canonical format, and the rules only reach the component's elements", async () => {
  const printed = printProgram(parse(SRC, "t"));
  assert.match(printed, /  style \{\n    \.box \{\n      border: 2px solid red;\n    \}\n    \.box:hover \{ color: #e11d48; \}\n  \}/);
  assert.equal(printProgram(parse(printed, "t")), printed, "idempotent");
  const r = compile([{ file: "app.art", src: SRC }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-style-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const [inside, outside] = [...document.querySelectorAll(".box")] as HTMLElement[];
    assert.equal(inside.getAttribute("data-s"), "Card");
    assert.equal(outside.getAttribute("data-s"), null);
    assert.equal(getComputedStyle(inside).borderTopColor, "red");
    assert.notEqual(getComputedStyle(outside).borderTopColor, "red");
  } finally {
    await GlobalRegistrator.unregister();
  }
});
