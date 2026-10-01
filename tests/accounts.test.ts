// Accounts: email verification, password reset and email() in server fns (dev outbox).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const SRC = 'model User {\n  id: ID\n  email: Email\n  password: String\n  verified: Bool\n}\n\napi users: User\n\nauth users\n\nserver fn invite(to) {\n  await email(to, "Join us", "Come!")\n}\n';
const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

test("accounts: the client methods are typed", () => {
  const types = (s: string) => check(parse(s, "t")).map((d) => d.type);
  assert.deepEqual(types(SRC + 'page P {\n  state t = ""\n  button "a" -> auth.requestReset("a@x.co")\n  button "b" -> auth.resetPassword(t, "12345678")\n  button "c" -> auth.verifyEmail(t)\n}\n'), []);
  const [d] = check(parse(SRC + 'page P {\n  button "a" -> auth.forgotPassword("a@x.co")\n}\n', "t"));
  assert.deepEqual(d.fixes, ["requestReset"]);
});

test("accounts: verification and reset links by email, one use, sessions ended on reset", async () => {
  const dir = mkdtempSync(join(tmpdir(), "art-acc-"));
  const r = compile([{ file: "a.art", src: SRC }]);
  const { fns } = await import(`data:text/javascript,${encodeURIComponent(r.server!.fns)}`);
  const api = createApi(r.server!, dir, fns);
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  const post = (path: string, body: unknown, cookie = "") => fetch(`${base}/${path}`, { method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://app.example" }, body: JSON.stringify(body) });
  const outbox = () => readFileSync(join(dir, "outbox.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const tokenIn = (text: string, path: string) => new RegExp(`https://app\\.example${path}\\?token=(\\w+)`).exec(text)![1];

  // Sign-up: unverified (whatever the client sends), with a verification link by email.
  const signup = await post("_auth/signup", { email: "a@x.co", password: "12345678", verified: true });
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await signup.json()).verified, false);
  const verify = tokenIn(outbox()[0].text, "/verify-email");
  assert.equal((await post("_auth/verify", { token: verify })).status, 204);
  assert.equal((await post("_auth/verify", { token: verify })).status, 400, "a link works once");
  assert.equal((await (await fetch(`${base}/_auth/me`, { headers: { cookie } })).json()).verified, true);

  // Reset: no email for unknown accounts, same answer.
  assert.equal((await post("_auth/reset-request", { email: "nobody@x.co" })).status, 204);
  assert.equal(outbox().length, 1);
  assert.equal((await post("_auth/reset-request", { email: "a@x.co" })).status, 204);
  const reset = tokenIn(outbox()[1].text, "/reset-password");
  assert.equal((await post("_auth/reset", { token: "nope", password: "abcdefgh" })).status, 400);
  assert.equal((await post("_auth/reset", { token: reset, password: "abcdefgh" })).status, 204);
  assert.equal(await (await fetch(`${base}/_auth/me`, { headers: { cookie } })).text(), "null", "every session ended");
  assert.equal((await post("_auth/login", { email: "a@x.co", password: "abcdefgh" })).status, 200);

  // email() in a server fn.
  await post("_fn/invite", { args: ["b@x.co"] });
  assert.deepEqual([outbox()[2].to, outbox()[2].subject], ["b@x.co", "Join us"]);
  assert.ok(existsSync(join(dir, "outbox.jsonl")));
});
