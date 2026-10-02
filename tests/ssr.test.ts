// Server rendering per request: `serve()` renders each page with its data, as the visitor.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { serve } from "../runtime/server.js";

const FIXTURE = "tests/fixtures/ssr/app.art";
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(env: Record<string, string> = {}) {
  const out = mkdtempSync(join(tmpdir(), "art-ssr-"));
  execFileSync(process.execPath, ["src/cli.ts", "build", FIXTURE, "--out", out], { stdio: "pipe" });
  Object.assign(process.env, env);
  const schema = compile([{ file: FIXTURE, src: readFileSync(FIXTURE, "utf8") }]).server!;
  const server: Server = serve(schema, {}, pathToFileURL(out + "/"), 0);
  servers.push(server);
  await new Promise((ok) => server.once("listening", ok));
  for (const k of Object.keys(env)) delete process.env[k];
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

test("ssr: pages arrive with their data, title and the responses the client reuses", async () => {
  const base = await start();
  const json = { "content-type": "application/json" };
  const made = await (await fetch(`${base}/api/products`, { method: "POST", headers: json, body: JSON.stringify({ name: "Blue chair" }) })).json();

  const home = await fetch(`${base}/`);
  assert.equal(home.headers.get("cache-control"), "private, no-store");
  const homeHtml = await home.text();
  assert.match(homeHtml, /<div id="app">.*Shop.*Blue chair.*<\/div><script type="application\/json" id="art-data">/s);
  assert.match(homeHtml, new RegExp(`href="/products/${made.id}"`));

  const page = await (await fetch(`${base}/products/${made.id}`)).text();
  assert.match(page, /<h2[^>]*>Blue chair<\/h2>/);
  assert.doesNotMatch(page, /Loading/);
  assert.match(page, /<title>A product<\/title>/);
  const seed = JSON.parse(/id="art-data">(.*?)<\/script>/.exec(page)![1]);
  assert.deepEqual(seed[`/api/products/${made.id}`], [200, made]);

  const missing = await (await fetch(`${base}/products/nope`)).text();
  assert.match(missing, /Loading/, "a missing row renders like the page does without it");
});

test("ssr: guards redirect on the server, as the visitor", async () => {
  const base = await start();
  const anon = await fetch(`${base}/admin`, { redirect: "manual" });
  assert.equal(anon.status, 302);
  assert.equal(anon.headers.get("location"), "/login");

  const json = { "content-type": "application/json" };
  const signup = await fetch(`${base}/api/_auth/signup`, { method: "POST", headers: json, body: JSON.stringify({ email: "a@x.co", password: "12345678" }) });
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  const signedIn = await fetch(`${base}/admin`, { headers: { cookie }, redirect: "manual" });
  assert.equal(signedIn.status, 200);
  assert.match(await signedIn.text(), /Secret area/);
});

test("ssr: ART_SSR=off serves the app shell", async () => {
  const base = await start({ ART_SSR: "off" });
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<div id="app"><\/div>/);
  assert.doesNotMatch(html, /art-data/);
});
