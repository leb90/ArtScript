// Routes: "/path/:param" pages, "*" not found, layouts with `slot`, History API navigation.
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

test("params are typed from the route; query and navigate exist", () => {
  assert.deepEqual(types('page P "/products/:id/reviews/:review" {\n  text `${params.id} ${params.review} ${query.page ?? "1"}`\n  button "home" -> navigate("/")\n}'), []);
  const [d] = check(parse('page P "/products/:id" {\n  text params.ID\n}', "t"));
  assert.deepEqual([d.type, d.fixes], ["UNKNOWN_FIELD", ["id"]]);
  assert.deepEqual(types('page P "/about" {\n  text params.id\n}'), ["UNDEFINED_NAME"]);
});

test("routes: valid shapes, no duplicates (param names don't matter), layouts exist", () => {
  assert.deepEqual(types('page A "about" {\n  text "a"\n}'), ["BAD_ROUTE"]);
  assert.deepEqual(types('page A "/p/:id" {\n  text "a"\n}\npage B "/p/:slug" {\n  text "b"\n}'), ["BAD_ROUTE"]);
  assert.deepEqual(types('page A "*" {\n  text "a"\n}'), []);
  const [d] = check(parse('layout Main {\n  slot\n}\npage A "/" layout Mian {\n  text "a"\n}', "t"));
  assert.deepEqual([d.type, d.fixes], ["UNKNOWN_TYPE", ["Main"]]);
});

test("slot: exactly one per layout, and only in layouts", () => {
  assert.deepEqual(types("layout Main {\n  column {\n    slot\n  }\n}"), []);
  assert.deepEqual(types('layout Main {\n  text "no slot"\n}'), ["LAYOUT_SLOT"]);
  assert.deepEqual(types("layout Main {\n  slot\n  slot\n}"), ["LAYOUT_SLOT"]);
  assert.deepEqual(types("page P {\n  slot\n}"), ["LAYOUT_SLOT"]);
});

const APP = `layout Main {
  state visits = 0

  row gap=2 {
    link "Inicio" to="/"
    link "Producto 7" to="/products/7"
    button "visita" -> visits++
    text \`visitas: \${visits}\`
  }
  slot
}

page Home "/" {
  title "Inicio"
}

page Product "/products/:id" {
  title \`Producto \${params.id}\`
  text \`pestaña \${query.tab ?? "info"}\`
  button "siguiente" -> navigate(\`/products/\${Number(params.id) + 1}\`)
}

page NotFound "*" {
  title "No encontrado"
}
`;

async function mount(url: string, base?: string) {
  const r = compile([{ file: "app.art", src: APP }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-router-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url });
  document.body.innerHTML = '<div id="app"></div>';
  const app = await import(pathToFileURL(join(dir, "app.js")).href + `?u=${encodeURIComponent(url)}`);
  app.start(document.getElementById("app"), base);
  const text = () => document.getElementById("app")!.textContent!.replace(/\s+/g, " ");
  const click = (label: string) => [...document.querySelectorAll<HTMLElement>("a, button")].find((x) => x.textContent === label)!.click();
  return { text, click };
}

test("router: params, query, links, navigate, back button, not found, persistent layout", async () => {
  const { text, click } = await mount("http://localhost/products/7?tab=specs");
  try {
    assert.match(text(), /Producto 7/);
    assert.match(text(), /pestaña specs/);

    click("visita");
    assert.match(text(), /visitas: 1/);

    click("Inicio"); // internal link: no reload, the layout keeps its state
    assert.equal(location.pathname, "/");
    assert.match(text(), /Inicio/);
    assert.match(text(), /visitas: 1/);

    click("Producto 7");
    click("siguiente"); // navigate()
    assert.equal(location.pathname, "/products/8");
    assert.match(text(), /Producto 8/);

    history.back(); // the browser's back button
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(location.pathname, "/products/7");
    assert.match(text(), /Producto 7/);
    assert.match(text(), /visitas: 1/);
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("router: unknown paths render the * page", async () => {
  const { text } = await mount("http://localhost/no/existe");
  try {
    assert.match(text(), /No encontrado/);
    assert.match(text(), /visitas: 0/, "inside the layout");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("router: an app served under a base path (art build --base)", async () => {
  const { text, click } = await mount("http://localhost/ArtScript/products/7", "/ArtScript/");
  try {
    assert.match(text(), /Producto 7/);
    const home = [...document.querySelectorAll("a")].find((a) => a.textContent === "Inicio")!;
    assert.equal(home.getAttribute("href"), "/ArtScript/", "links get the prefix");
    click("siguiente");
    assert.equal(location.pathname, "/ArtScript/products/8", "navigate() too");
    assert.match(text(), /Producto 8/);
    click("Inicio");
    assert.equal(location.pathname, "/ArtScript/");
    assert.match(text(), /Inicio/);
  } finally {
    await GlobalRegistrator.unregister();
  }
});

const NESTED = `layout Site {
  state visits = 0

  row gap=2 {
    link "Home" to="/"
    link "Intro" to="/docs/intro"
    button "visit" -> visits++
    text \`visits: \${visits}\`
  }
  slot
}

layout Docs layout Site {
  state opened = 0

  row gap=2 {
    link "Install" to="/docs/install"
    button "open" -> opened++
    text \`opened: \${opened}\`
  }
  slot
}

page Home "/" {
  title "Home page"
}

page Intro "/docs/intro" layout Docs {
  title "Intro page"
}

page Install "/docs/install" layout Docs {
  title "Install page"
}
`;

test("nested layouts: canonical format; the outer layout must exist and not loop", () => {
  assert.equal(printProgram(parse(NESTED, "t")), NESTED);
  assert.deepEqual(types(NESTED), []);
  const [d] = check(parse("layout Site {\n  slot\n}\nlayout Docs layout Sit {\n  slot\n}", "t"));
  assert.deepEqual([d.type, d.fixes], ["UNKNOWN_TYPE", ["Site"]]);
  assert.deepEqual(types("layout A layout B {\n  slot\n}\nlayout B layout A {\n  slot\n}"), ["LAYOUT_CYCLE", "LAYOUT_CYCLE"]);
});

test("nested layouts: shared layouts stay mounted, the rest change with the page", async () => {
  const r = compile([{ file: "app.art", src: NESTED }]);
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.js!, /path: "\/", comp: Home, layouts: \[Site\]/, "pages without a layout use the only top-level one");
  assert.match(r.js!, /layouts: \[Site, Docs\]/);
  const dir = mkdtempSync(join(tmpdir(), "art-nested-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: "http://localhost/docs/intro" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const text = () => document.getElementById("app")!.textContent!.replace(/\s+/g, " ");
    const click = (label: string) => [...document.querySelectorAll<HTMLElement>("a, button")].find((x) => x.textContent === label)!.click();
    assert.match(text(), /visits: 0.*opened: 0.*Intro page/);
    click("visit");
    click("open");
    click("Install"); // both layouts stay
    assert.match(text(), /visits: 1.*opened: 1.*Install page/);
    click("Home"); // Docs goes away, Site stays
    assert.match(text(), /visits: 1/);
    assert.doesNotMatch(text(), /opened/);
    assert.match(text(), /Home page/);
    click("Intro"); // Docs comes back fresh
    assert.match(text(), /visits: 1.*opened: 0.*Intro page/);
    assert.equal(document.querySelectorAll("button").length, 2, "no leftover nodes");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("links to the current page get aria-current", async () => {
  const { click } = await mount("http://localhost/");
  try {
    const link = (label: string) => [...document.querySelectorAll("a")].find((a) => a.textContent === label)!;
    assert.equal(link("Inicio").getAttribute("aria-current"), "page");
    assert.equal(link("Producto 7").getAttribute("aria-current"), null);
    click("Producto 7");
    assert.equal(link("Inicio").getAttribute("aria-current"), null);
    assert.equal(link("Producto 7").getAttribute("aria-current"), "page");
  } finally {
    await GlobalRegistrator.unregister();
  }
});
