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
