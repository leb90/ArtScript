// Backend: `api` declarations, typed client, `data`, `await`, try/catch, and the server runtime.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
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

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);
const USER = "model User {\n  id: ID\n  name: String\n  email: Email\n}\napi users: User\n";
const page = (body: string) => `${USER}page P {\n${body}\n}`;

// ---------- language ----------
test("api: model must exist and have an ID field", () => {
  assert.deepEqual(types("api users: Usr"), ["UNKNOWN_TYPE"]);
  assert.deepEqual(types("model Note {\n  text: String\n}\napi notes: Note"), ["MISSING_FIELD"]);
  assert.deepEqual(types(USER), []);
});

test("api client: method types, data types, await", () => {
  const src = page(`  data users = api.users.list()
  data first = api.users.get("1")
  computed n = users.length
  fn add() {
    let u = await api.users.create({ name: "a", email: "a@b.co" })
    let id = u.id
  }
  text first?.name ?? "-"`);
  assert.deepEqual(types(src), []);
  // `data` from get() is nullable
  assert.deepEqual(types(page('  data first = api.users.get("1")\n  text first.name')), ["POSSIBLY_EMPTY"]);
});

test("api client: create/update arguments are checked against the model", () => {
  assert.deepEqual(types(page('  button "x" -> api.users.create({ name: "a" })')), ["MISSING_FIELD"]); // email missing; id is optional
  assert.deepEqual(types(page('  button "x" -> api.users.create({ name: "a", email: "e", rol: 1 })')), ["UNKNOWN_FIELD"]);
  assert.deepEqual(types(page('  button "x" -> api.users.update("1", { name: "b" })')), []); // partial update
  assert.deepEqual(types(page('  button "x" -> api.users.update("1", { name: 2 })')), ["TYPE_MISMATCH"]);
  assert.deepEqual(types(page('  button "x" -> api.users.remove()')), ["TYPE_MISMATCH"]);
  const [d] = check(parse(page('  button "x" -> api.users.delete("1")'), "t"));
  assert.equal(d.type, "UNKNOWN_FIELD");
  assert.deepEqual(d.fixes, ["remove"]);
});

test("data needs an api call; `api` only exists when apis are declared", () => {
  assert.deepEqual(types(page("  data x = 5")), ["TYPE_MISMATCH"]);
  assert.deepEqual(types('page P {\n  data x = api.users.list()\n}'), ["UNDEFINED_NAME"]);
});

test("try/catch: the error has message, status and details", () => {
  assert.deepEqual(types(page('  state err = ""\n  fn add() {\n    try {\n      await api.users.remove("1")\n    } catch (e) {\n      err = e.message\n    }\n  }')), []);
});

test("fmt: api, data, await and try/catch round-trip canonically", () => {
  const src = readFileSync("examples/users/app.art", "utf8");
  assert.equal(printProgram(parse(src, "u")), src);
});

test("codegen: async functions and handlers only where await is used", () => {
  const js = compile([{ file: "u", src: readFileSync("examples/users/app.art", "utf8") }]).js!;
  assert.match(js, /const api = \{ users: \$\.\$api\("users"\) \};/);
  assert.match(js, /const users = \$\.\$data\(\(\) => api\.users\.list\(\), \[\]\);/);
  assert.match(js, /async function add\(\)/);
  assert.match(js, /\$\.\$on\(e\d+, "click", \(\) => \{\n\s+api\.users\.remove/);
});

// ---------- server runtime ----------
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function startApi(dataDir = mkdtempSync(join(tmpdir(), "art-data-"))) {
  const schema = compile([{ file: "u", src: readFileSync("examples/users/app.art", "utf8") }]).server!;
  const api = createApi(schema, dataDir);
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  return { base: `http://localhost:${(server.address() as AddressInfo).port}`, dataDir };
}

const json = (method: string, body?: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("server: CRUD, validation, 404 and persistence", async () => {
  const { base, dataDir } = await startApi();
  const created = await (await fetch(`${base}/api/users`, json("POST", { name: "Ana", email: "ana@x.co", admin: false }))).json();
  assert.equal(typeof created.id, "string");

  const bad = await fetch(`${base}/api/users`, json("POST", { name: "Bo", email: "nope", admin: false }));
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "VALIDATION", message: 'invalid email: expected Email, got "nope"', field: "email", expected: "Email", actual: '"nope"' });
  assert.equal((await fetch(`${base}/api/users`, json("POST", { name: "Bo", email: "b@x.co" }))).status, 400); // admin missing
  assert.equal((await fetch(`${base}/api/users`, json("POST", { ...created }))).status, 409); // same id

  const updated = await (await fetch(`${base}/api/users/${created.id}`, json("PATCH", { admin: true, id: "hack" }))).json();
  assert.deepEqual(updated, { ...created, admin: true }); // the id never changes
  assert.equal((await fetch(`${base}/api/users/nope`)).status, 404);

  // A new server on the same data dir sees the stored rows.
  const again = await startApi(dataDir);
  assert.deepEqual(await (await fetch(`${again.base}/api/users`)).json(), [updated]);
  assert.equal((await fetch(`${base}/api/users/${created.id}`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await (await fetch(`${base}/api/users`)).json(), []);
});

// ---------- end to end: page + client + server ----------
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), "condition not reached");
};

test("e2e: data loads, create/update/remove re-fetch, errors are shown", async () => {
  const { base } = await startApi();
  await fetch(`${base}/api/users`, json("POST", { name: "Ana", email: "ana@x.co", admin: false }));
  const { root } = await mountApp(readFileSync("examples/users/app.art", "utf8"), (rt) => rt.setApiBase(base));
  const summary = () => all(root, "span").find((s) => /users/.test(s.textContent))?.textContent;
  await until(() => summary() === "1 users, 0 admins");

  const [name, email] = all(root, "input");
  const form = all(root, "form")[0];
  name.typeText("Bo");
  email.typeText("bo@x.co");
  form.submit();
  await until(() => summary() === "2 users, 0 admins");
  assert.equal(name.value, "");

  all(root, "button").find((b) => b.textContent === "Make admin")!.click();
  await until(() => summary() === "2 users, 1 admins");

  all(root, "button").filter((b) => b.textContent === "x")[0].click();
  await until(() => summary() === "1 users, 1 admins" || summary() === "1 users, 0 admins");

  name.typeText("Cy");
  email.typeText("no-es-email");
  form.submit();
  await until(() => all(root, "span").some((s) => s.textContent === 'invalid email: expected Email, got "no-es-email"'));
});
