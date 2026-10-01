// Scheduled server jobs, and sessions that expire, log out everywhere and end on a password change.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);
const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(src: string, load?: (mod: string) => Promise<{ fns: object; jobs: object }>) {
  const r = compile([{ file: "a.art", src }]);
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), "art-srv-"));
  const mod = load ? await load(r.server!.fns) : { fns: {}, jobs: {} };
  const api = createApi(r.server!, dir, mod.fns, mod.jobs);
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  return { api, dir, base: `http://localhost:${(server.address() as AddressInfo).port}/api` };
}

test("server job: syntax, checks, and it runs on its interval", async () => {
  const src = 'model Item {\n  id: ID\n  done: Bool\n}\n\napi items: Item\n\nserver job cleanup every "1s" {\n  let old = db.items.list({ where: { done: true } })\n  old.forEach(i => db.items.remove(i.id))\n}\n';
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src), []);
  assert.deepEqual(types(src.replace('"1s"', '"soon"')), ["TYPE_MISMATCH"]);
  // A job isn't callable from the client.
  assert.deepEqual(types(src + 'page P {\n  button "x" -> server.cleanup()\n}\n'), ["UNDEFINED_NAME"]);

  const { api, base } = await start(src, async (code) => import(`data:text/javascript,${encodeURIComponent(code)}`));
  const post = (done: boolean) => fetch(`${base}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ done }) });
  await post(true);
  await post(false);
  for (let i = 0; i < 40 && (await (await fetch(`${base}/items`)).json()).length !== 1; i++) await new Promise((ok) => setTimeout(ok, 100));
  assert.equal((await (await fetch(`${base}/items`)).json()).length, 1, "the done item was removed by the job");
  api.stop();
});

const AUTH = "model User {\n  id: ID\n  email: Email\n  password: String\n}\n\napi users: User\n\nauth users\n";

test("sessions: expire on the server, log out everywhere, end on a password change", async () => {
  const { base, dir } = await start(AUTH);
  const json = (body: unknown, cookie = "") => ({ method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  const cookieOf = (r: Response) => r.headers.get("set-cookie")!.split(";")[0];
  const me = async (cookie: string) => (await (await fetch(`${base}/_auth/me`, { headers: { cookie } })).text());

  const a = cookieOf(await fetch(`${base}/_auth/signup`, json({ email: "a@x.co", password: "12345678" })));
  const b = cookieOf(await fetch(`${base}/_auth/login`, json({ email: "a@x.co", password: "12345678" })));
  assert.match(await me(a), /a@x.co/);

  // A password change from session a ends session b.
  const user = JSON.parse(await me(a));
  await fetch(`${base}/users/${user.id}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: a }, body: JSON.stringify({ password: "abcdefgh" }) });
  assert.match(await me(a), /a@x.co/);
  assert.equal(await me(b), "null");

  // Log out everywhere.
  const c = cookieOf(await fetch(`${base}/_auth/login`, json({ email: "a@x.co", password: "abcdefgh" })));
  await fetch(`${base}/_auth/logout-all`, { method: "POST", headers: { cookie: a } });
  assert.equal(await me(a), "null");
  assert.equal(await me(c), "null");

  // An expired session is rejected (and deleted) by the server.
  const d = cookieOf(await fetch(`${base}/_auth/login`, json({ email: "a@x.co", password: "abcdefgh" })));
  new DatabaseSync(join(dir, "art.db")).exec("UPDATE _sessions SET expires = 1");
  assert.equal(await me(d), "null");
});
