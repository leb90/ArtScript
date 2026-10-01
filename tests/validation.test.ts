// Field rules on models: min/max, match, unique. Checked by the compiler and enforced by the server.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

const SRC = `model Product {
  id: ID
  name: String min=2 max=20
  code: String match="^[A-Z]{3}$" unique
  price: Number min=0
  tags: String[] max=2
}

api products: Product
`;

test("rules: syntax, canonical format and checks", () => {
  assert.deepEqual(types(SRC), []);
  assert.equal(printProgram(parse(SRC, "t")), SRC);
  assert.deepEqual(types("model A {\n  id: ID\n  ok: Bool min=1\n}"), ["TYPE_MISMATCH"]);
  assert.deepEqual(types("model A {\n  id: ID\n  n: Number min=5 max=1\n}"), ["TYPE_MISMATCH"]);
  assert.deepEqual(types('model A {\n  id: ID\n  s: String match="("\n}'), ["TYPE_MISMATCH"]);
  assert.throws(() => parse("model A {\n  id: ID\n  s: String lenght=3\n}", "t"), /min=, max=, match/);
});

const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

test("rules: the server rejects invalid rows with an explanation", async () => {
  const api = createApi(compile([{ file: "a.art", src: SRC }]).server!, mkdtempSync(join(tmpdir(), "art-rules-")));
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api/products`;
  const post = (body: unknown) => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const ok = { name: "Mesa", code: "ABC", price: 10, tags: [] };

  assert.equal((await post(ok)).status, 201);
  const cases: [object, number, RegExp][] = [
    [{ ...ok, code: "XYZ", name: "M" }, 400, /invalid name: expected at least 2 characters, got 1 characters/],
    [{ ...ok, code: "XYZ", price: -1 }, 400, /invalid price: expected at least 0, got -1/],
    [{ ...ok, code: "xy" }, 400, /invalid code: expected text matching/],
    [{ ...ok, code: "XYZ", tags: ["a", "b", "c"] }, 400, /at most 2 items/],
    [{ ...ok }, 409, /code "ABC" is already used/],
  ];
  for (const [body, status, msg] of cases) {
    const r = await post(body);
    assert.equal(r.status, status);
    assert.match((await r.json()).message, msg);
  }
  // Updating a row keeps its own unique value.
  const [row] = await (await fetch(base)).json();
  const upd = await fetch(`${base}/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ price: 12 }) });
  assert.equal(upd.status, 200);
});

test("data: loading, error and reload", async () => {
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  const { copyFileSync, writeFileSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const src = SRC + `
page Home {
  state sort = "price"
  data items = api.products.list({ sort })

  if items.loading {
    text "Loading"
  } else if items.error {
    text \`Error: \${items.error}\` id="err"
  } else {
    text \`\${items.length} products\` id="n"
  }
  button "break" -> sort = "nope"
  button "fix" -> sort = "name"
  button "reload" -> items.reload()
}
`;
  const r = compile([{ file: "a.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  const api = createApi(r.server!, mkdtempSync(join(tmpdir(), "art-data-")));
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const dir = mkdtempSync(join(tmpdir(), "art-data-app-"));
  writeFileSync(join(dir, "app.js"), r.js!);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  GlobalRegistrator.register({ url: base + "/" });
  try {
    document.body.innerHTML = '<div id="app"></div>';
    const rt = await import(pathToFileURL(join(dir, "runtime.js")).href);
    rt.setApiBase(base);
    const app = await import(pathToFileURL(join(dir, "app.js")).href);
    app.start(document.getElementById("app"));
    const text = () => document.getElementById("app")!.textContent!;
    const until = async (re: RegExp) => { for (let i = 0; i < 100 && !re.test(text()); i++) await new Promise((ok) => setTimeout(ok, 10)); assert.match(text(), re); };
    assert.match(text(), /Loading/);
    await until(/0 products/);
    const click = (l: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === l)!.click();
    click("break");
    await until(/Error: Product has no field 'nope'/);
    click("fix");
    await until(/0 products/);
    await fetch(`${base}/api/products`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Mesa", code: "QQQ", price: 1, tags: [] }) });
    click("reload"); // written by someone else: reload() fetches again
    await until(/1 products/);
  } finally {
    await GlobalRegistrator.unregister();
  }
});
