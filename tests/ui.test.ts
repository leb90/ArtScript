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
  assert.deepEqual(types('page P {\n  state c = 0\n  canvas ref=c\n}'), ["UNKNOWN_ELEMENT", "TYPE_MISMATCH"].slice(0, 1));
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
