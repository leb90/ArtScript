// Auth (signup/login/logout/me), login/private apis and server fns: language, server and end to end.
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

const NOTES = readFileSync("examples/notes/app.art", "utf8");
const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);
const BASE = "model User {\n  id: ID\n  email: Email\n  password: String\n}\nmodel Note {\n  id: ID\n  owner: ID\n  text: String\n}\napi users: User\n";

// ---------- language ----------
test("auth: needs an api whose model has email: Email and password: String", () => {
  assert.deepEqual(types(BASE + "auth users"), []);
  assert.deepEqual(types(BASE + "auth usrs"), ["UNKNOWN_TYPE"]);
  assert.deepEqual(types("model U {\n  id: ID\n  email: String\n}\napi us: U\nauth us"), ["MISSING_FIELD"]);
});

test("api access: login/private need auth, private needs owner: ID", () => {
  assert.deepEqual(types(BASE + "api notes: Note private"), ["AUTH_REQUIRED"]);
  assert.deepEqual(types(BASE + "auth users\napi notes: Note private"), []);
  assert.deepEqual(types(BASE + "auth users\napi accounts: User private"), ["MISSING_FIELD"]); // User has no owner
});

test("private apis fill owner on create; public ones don't", () => {
  const page = (api: string) => `${BASE}auth users\napi notes: Note ${api}\npage P {\n  button "x" -> api.notes.create({ text: "a" })\n}`;
  assert.deepEqual(types(page("private")), []);
  assert.deepEqual(types(page("login")), ["MISSING_FIELD"]);
});

test("auth client: methods, argument checks and synonyms", () => {
  const page = (body: string) => `${BASE}auth users\npage P {\n${body}\n}`;
  assert.deepEqual(types(page('  data me = auth.me()\n  text me?.email ?? "-"\n  button "in" -> auth.login("a@b.co", "secreto123")\n  button "out" -> auth.logout()')), []);
  assert.deepEqual(types(page('  button "x" -> auth.signup({ email: "a@b.co" })')), ["MISSING_FIELD"]);
  assert.deepEqual(types(page('  button "x" -> auth.login("a@b.co")')), ["TYPE_MISMATCH"]);
  const [d] = check(parse(page('  button "x" -> auth.register({ email: "a@b.co", password: "x" })'), "t"));
  assert.deepEqual([d.type, d.fixes], ["UNKNOWN_FIELD", ["signup"]]);
});

test("server fn: db is synchronous, me/fail exist, return type reaches the client", () => {
  const src = `${BASE}auth users\nserver fn count() {\n  if !me {\n    fail("no")\n  }\n  return db.users.list().length + me.email.length\n}\npage P {\n  data n = server.count()\n  text (n ?? 0) + 1\n}`;
  assert.deepEqual(types(src), []);
  // Without the early `fail`, `me` may be null.
  assert.deepEqual(types(src.replace('  if !me {\n    fail("no")\n  }\n', "")), ["POSSIBLY_EMPTY"]);
  // `db` and `me` only exist on the server.
  assert.deepEqual(types(`${BASE}page P {\n  text db.users.list().length\n}`), ["UNDEFINED_NAME"]);
});

test("fmt: auth, access modifiers and server fns round-trip canonically", () => {
  assert.equal(printProgram(parse(NOTES, "n")), NOTES);
});

// ---------- server ----------
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function startNotes() {
  const server_ = compile([{ file: "n", src: NOTES }]).server!;
  const { fns } = await import(`data:text/javascript,${encodeURIComponent(server_.fns)}`);
  const api = createApi(server_, mkdtempSync(join(tmpdir(), "art-auth-")), fns);
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

// A fetch with its own cookie jar (Node's fetch doesn't keep cookies).
function client(base: string) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api/${path}`, {
      method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return call;
}

test("server: sessions, private rows, account protection and server fns", async () => {
  const base = await startNotes();
  const ana = client(base), bo = client(base), anon = client(base);

  assert.equal((await anon("GET", "notes")).status, 401);
  const a = await ana("POST", "_auth/signup", { name: "Ana", email: "ana@x.co", password: "secreto123" });
  assert.equal(a.status, 201);
  assert.equal(a.body.password, undefined, "password is never returned");
  assert.equal((await anon("POST", "_auth/signup", { name: "A", email: "ana@x.co", password: "secreto123" })).status, 409);
  assert.equal((await anon("POST", "_auth/signup", { name: "A", email: "z@x.co", password: "corta" })).status, 400);
  await bo("POST", "_auth/signup", { name: "Bo", email: "bo@x.co", password: "secreto456" });

  const note = (await ana("POST", "notes", { text: "pan", done: false, owner: "someone-else" })).body;
  assert.equal(note.owner, a.body.id, "owner always comes from the session");
  assert.deepEqual((await bo("GET", "notes")).body, []);
  assert.equal((await bo("DELETE", `notes/${note.id}`)).status, 404);
  assert.equal((await bo("PATCH", `notes/${note.id}`, { done: true })).status, 404);

  // Nobody can take over another account through the users api.
  assert.equal((await bo("PATCH", `users/${a.body.id}`, { password: "hackeado1" })).status, 403);
  assert.equal((await bo("DELETE", `users/${a.body.id}`)).status, 403);
  assert.equal((await bo("POST", "users", { name: "X", email: "x@x.co", password: "secreto789" })).status, 403);
  assert.equal((await anon("GET", "users")).status, 401);
  assert.ok((await bo("GET", "users")).body.every((u: any) => u.password === undefined));

  assert.deepEqual((await ana("POST", "_fn/stats", { args: [] })).body, { total: 1, done: 0 });
  assert.equal((await anon("POST", "_fn/stats", { args: [] })).status, 401);
  assert.equal((await anon("POST", "_fn/nope", { args: [] })).status, 404);

  assert.equal((await anon("POST", "_auth/login", { email: "ana@x.co", password: "mal" })).status, 401);
  const relog = client(base);
  assert.equal((await relog("POST", "_auth/login", { email: "ana@x.co", password: "secreto123" })).status, 200);
  assert.equal((await relog("GET", "notes")).body.length, 1);
  await relog("POST", "_auth/logout");
  assert.equal((await relog("GET", "_auth/me")).body, null);
});

// ---------- end to end ----------
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), "condition not reached");
};

test("e2e: sign up, add and toggle notes, stats update, log out", async () => {
  const base = await startNotes();
  // The browser keeps the session cookie; emulate it for the page's fetch calls.
  let cookie = "";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const res = await realFetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  }) as typeof fetch;
  try {
    const { root } = await mountApp(NOTES, (rt) => rt.setApiBase(base));
    const text = () => all(root, "span").map((s) => s.textContent).concat(all(root, "h2").map((h) => h.textContent));
    await until(() => text().includes("Notas"));

    const [name, email, password] = all(root, "input");
    name.typeText("Ana");
    email.typeText("ana@x.co");
    password.typeText("secreto123");
    all(root, "button").find((b) => b.textContent === "Crear cuenta")!.click();
    await until(() => text().includes("Notas de Ana"));
    await until(() => text().includes("0 de 0 hechas"));

    const note = all(root, "input")[0];
    note.typeText("comprar pan");
    all(root, "form")[0].submit();
    await until(() => text().includes("comprar pan") && text().includes("0 de 1 hechas"));

    all(root, "button").find((b) => b.textContent === "○")!.click();
    await until(() => text().includes("1 de 1 hechas"));
    assert.ok(all(root, "span").find((s) => s.textContent === "comprar pan")!.className.includes("a-muted"));

    all(root, "button").find((b) => b.textContent === "Salir")!.click();
    await until(() => text().includes("Notas") && !text().includes("Notas de Ana"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
