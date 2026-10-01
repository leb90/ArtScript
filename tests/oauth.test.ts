// `auth users with google`: the OAuth flow against a fake provider (the endpoints come from env).
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

const SRC = "model User {\n  id: ID\n  email: Email\n  password: String\n  name: String\n}\n\napi users: User\n\nauth users with google\n";
const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));
const listen = async (s: ReturnType<typeof createServer>) => { servers.push(s); await new Promise<void>((ok) => s.listen(0, ok)); return `http://localhost:${(s.address() as AddressInfo).port}`; };

test("oauth: syntax and checks", () => {
  assert.equal(printProgram(parse(SRC, "t")), SRC);
  const types = (s: string) => check(parse(s, "t")).map((d) => d.type);
  assert.deepEqual(types(SRC + 'page P {\n  button "G" -> auth.loginWith("google")\n}\n'), []);
  assert.deepEqual(types(SRC + 'page P {\n  button "G" -> auth.loginWith("github")\n}\n'), ["TYPE_MISMATCH"]);
  assert.deepEqual(types(SRC.replace("with google", "with gogle")), ["UNKNOWN_TYPE"]);
});

test("oauth: redirect with state, callback creates the user and signs in, bad state refused", async () => {
  const provider = await listen(createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/token") return res.end(JSON.stringify({ access_token: "tok" }));
    if (req.url === "/user") return res.end(JSON.stringify(req.headers.authorization === "Bearer tok" ? { email: "ana@gmail.com", name: "Ana G", email_verified: true } : {}));
    res.writeHead(404).end();
  }));
  Object.assign(process.env, { ART_GOOGLE_ID: "id", ART_GOOGLE_SECRET: "secret", ART_GOOGLE_AUTHORIZE: `${provider}/authorize`, ART_GOOGLE_TOKEN: `${provider}/token`, ART_GOOGLE_USER: `${provider}/user` });
  const api = createApi(compile([{ file: "a.art", src: SRC }]).server!, mkdtempSync(join(tmpdir(), "art-oauth-")));
  const base = await listen(createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); }));

  const start = await fetch(`${base}/api/_auth/oauth/google`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get("location")!);
  assert.equal(to.origin + to.pathname, `${provider}/authorize`);
  assert.equal(to.searchParams.get("redirect_uri"), `${base}/api/_auth/oauth/google/callback`);
  const state = to.searchParams.get("state")!;
  const stateCookie = start.headers.get("set-cookie")!.split(";")[0];

  const bad = await fetch(`${base}/api/_auth/oauth/google/callback?code=c&state=forged`, { redirect: "manual", headers: { cookie: stateCookie } });
  assert.equal(bad.status, 400);

  const back = await fetch(`${base}/api/_auth/oauth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: { cookie: stateCookie } });
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("location"), "/");
  const session = back.headers.getSetCookie().find((c) => c.startsWith("art_session="))!.split(";")[0];
  const me = await (await fetch(`${base}/api/_auth/me`, { headers: { cookie: session } })).json();
  assert.deepEqual([me.email, me.name], ["ana@gmail.com", "Ana G"]);

  assert.equal((await fetch(`${base}/api/_auth/oauth/github`, { redirect: "manual" })).status, 404, "not enabled");
});
