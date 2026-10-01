// SQLite storage, queries (where/search/sort/limit/offset/count), admin roles and JSON migration.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
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
import { all, mountApp } from "./helpers.ts";

const CATALOG = readFileSync("examples/catalog/app.art", "utf8");
const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);
const BASE = "model P {\n  id: ID\n  name: String\n  price: Number\n  active: Bool\n}\napi ps: P\n";
const page = (body: string) => `${BASE}page X {\n${body}\n}`;

// ---------- language ----------
test("list/count options are checked against the model", () => {
  assert.deepEqual(types(page('  data a = api.ps.list({ where: { active: true }, search: "x", sort: "-price", limit: 10, offset: 0 })\n  data n = api.ps.count({ search: "x" })\n  text n + 1')), []);
  assert.deepEqual(types(page('  data a = api.ps.list({ order: "name" })')), ["UNKNOWN_FIELD"]);
  assert.deepEqual(types(page('  data a = api.ps.list({ sort: "-cost" })')), ["UNKNOWN_FIELD"]);
  assert.deepEqual(types(page('  data a = api.ps.list({ where: { price: "cheap" } })')), ["TYPE_MISMATCH"]);
  assert.deepEqual(types(page('  data a = api.ps.list({ limit: "10" })')), ["TYPE_MISMATCH"]);
  assert.deepEqual(types(page('  data n = api.ps.count({ sort: "name" })')), ["UNKNOWN_FIELD"]);
  const [d] = check(parse(page('  data a = api.ps.list({ wher: {} })'), "t"));
  assert.deepEqual(d.fixes, ["where"]);
});

test("admin access needs auth and a role: String field; signup doesn't take a role", () => {
  const users = (role: string) => `model U {\n  id: ID\n  email: Email\n  password: String\n${role}}\napi us: U\nauth us\n`;
  assert.deepEqual(types(users("  role: String\n") + BASE.replace("api ps: P", "api ps: P admin")), []);
  assert.deepEqual(types(users("") + BASE.replace("api ps: P", "api ps: P admin")), ["MISSING_FIELD"]);
  assert.deepEqual(types(BASE.replace("api ps: P", "api ps: P admin")), ["AUTH_REQUIRED"]);
  assert.deepEqual(types(users("  role: String\n") + 'page X {\n  button "s" -> auth.signup({ email: "a@b.co", password: "secreto123" })\n}'), []);
});

test("fmt: the catalog example is canonical (and `$${x}` stays unescaped)", () => {
  assert.equal(printProgram(parse(CATALOG, "c")), CATALOG);
});

// ---------- server ----------
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(src: string, dataDir = mkdtempSync(join(tmpdir(), "art-q-"))) {
  const schema = compile([{ file: "c", src }]).server!;
  const { fns } = await import(`data:text/javascript,${encodeURIComponent(schema.fns)}`);
  const api = createApi(schema, dataDir, fns);
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  return { base: `http://localhost:${(server.address() as AddressInfo).port}`, dataDir };
}

function client(base: string) {
  let cookie = "";
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api/${path}`, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
}
const q = (o: unknown) => `?q=${encodeURIComponent(JSON.stringify(o))}`;

test("server: where, search, sort, limit/offset and count", async () => {
  const { base } = await start(`${BASE}page X {\n  text "x"\n}`);
  const c = client(base);
  for (const [name, price, active] of [["Pan", 2, true], ["Leche", 1.5, true], ["Queso", 9, false], ["Pan rallado", 3, true]] as const) {
    await c("POST", "ps", { name, price, active });
  }
  const names = async (o: unknown) => (await c("GET", "ps" + q(o))).body.map((p: any) => p.name);
  assert.deepEqual(await names({}), ["Pan", "Leche", "Queso", "Pan rallado"], "insertion order by default");
  assert.deepEqual(await names({ where: { active: false } }), ["Queso"]);
  assert.deepEqual(await names({ search: "pan" }), ["Pan", "Pan rallado"], "case-insensitive substring");
  assert.deepEqual(await names({ sort: "-price" }), ["Queso", "Pan rallado", "Pan", "Leche"]);
  assert.deepEqual(await names({ sort: "price", limit: 2, offset: 1 }), ["Pan", "Pan rallado"]);
  assert.equal((await c("GET", "ps/_count" + q({ search: "pan" }))).body, 2);
  assert.equal((await c("GET", "ps/_count")).body, 4);
  assert.equal((await c("GET", "ps" + q({ sort: "cost" }))).status, 400);
});

test("server: admin role — first signup is admin, roles can't be self-assigned", async () => {
  const { base } = await start(CATALOG);
  const admin = client(base), user = client(base), anon = client(base);
  const a = await admin("POST", "_auth/signup", { name: "Ana", email: "ana@x.co", password: "secreto123", role: "user" });
  assert.equal(a.body.role, "admin", "first account is the admin, whatever it asks for");
  const u = await user("POST", "_auth/signup", { name: "Bo", email: "bo@x.co", password: "secreto456", role: "admin" });
  assert.equal(u.body.role, "user", "later accounts are users, whatever they ask for");

  assert.equal((await anon("POST", "products", { name: "Pan", price: 2, active: true })).status, 401);
  assert.equal((await user("POST", "products", { name: "Pan", price: 2, active: true })).status, 403);
  const p = await admin("POST", "products", { name: "Pan", price: 2, active: true });
  assert.equal(p.status, 201);
  assert.equal((await anon("GET", "products")).body.length, 1, "anyone reads an admin api");
  assert.equal((await user("DELETE", `products/${p.body.id}`)).status, 403);

  assert.equal((await user("PATCH", `users/${u.body.id}`, { role: "admin" })).status, 403, "no self-promotion");
  assert.equal((await user("PATCH", `users/${u.body.id}`, { name: "Bob" })).status, 200);
  assert.equal((await admin("PATCH", `users/${u.body.id}`, { role: "admin" })).body.role, "admin", "admins manage roles");
  assert.equal((await user("POST", "products", { name: "Leche", price: 1, active: true })).status, 201, "the promoted user can now write");
});

test("server: data from JSON files (previous versions) is imported into SQLite once", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "art-mig-"));
  writeFileSync(join(dataDir, "ps.json"), JSON.stringify([{ id: "1", name: "Viejo", price: 1, active: true }]));
  const { base } = await start(`${BASE}page X {\n  text "x"\n}`, dataDir);
  assert.deepEqual((await client(base)("GET", "ps")).body.map((p: any) => p.name), ["Viejo"]);
  assert.ok(existsSync(join(dataDir, "ps.json.imported")) && existsSync(join(dataDir, "art.db")));
});

// ---------- end to end ----------
const until = async (cond: () => boolean, what: () => string = () => "") => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), `condition not reached. Screen: ${what()}`);
};

test("e2e: admin adds products, pagination, search and sort", async () => {
  const { base } = await start(CATALOG);
  let cookie = "";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const res = await realFetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  }) as typeof fetch;
  try {
    const { root } = await mountApp(CATALOG, (rt) => rt.setApiBase(base));
    const text = () => all(root, "span").map((s) => s.textContent).join(" | ");
    const button = (label: string) => all(root, "button").find((b) => b.textContent === label)!;
    const input = (ph: string) => all(root, "input").find((i) => i.placeholder === ph)!;

    input("Email").typeText("ana@x.co");
    input("Password").typeText("secreto123");
    button("Sign up").click();
    await until(() => text().includes("ana@x.co (admin)"), text);

    for (const [name, price] of [["Pan", 2], ["Leche", 1.5], ["Queso", 9], ["Arroz", 3], ["Café", 7], ["Té", 4]] as const) {
      input("Product").typeText(name);
      input("Price").typeText(String(price));
      all(root, "form")[0].submit();
      await until(() => input("Product").value === "", text);
    }
    await until(() => text().includes("6 products") && text().includes("Page 1 of 2"), text);
    button("Next").click();
    await until(() => text().includes("Page 2 of 2") && text().includes("Té"), text);

    button("Prev").click();
    input("Search").typeText("le");
    await until(() => text().includes("1 products") && text().includes("Leche"), text);
    input("Search").typeText("");
    button("Sort: name").click();
    await until(() => button("Sort: price") !== undefined && all(root, "span").find((s) => s.textContent?.startsWith("$"))?.textContent === "$9.00", text);
  } finally {
    globalThis.fetch = realFetch;
  }
});
