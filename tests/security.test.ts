// Security defaults: CSRF, body limits, login rate limit, safe URLs, headers, health check.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { serve } from "../runtime/server.js";
// @ts-ignore: runtime is plain JS
import { $attr, root } from "../runtime/runtime.js";

const SRC = "model User {\n  id: ID\n  email: Email\n  password: String\n}\n\napi users: User\n\nauth users\n";
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "art-sec-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><div id=app></div>");
  const server: Server = serve(compile([{ file: "a.art", src: SRC }]).server!, {}, pathToFileURL(dir + "/"), 0);
  servers.push(server);
  await new Promise((ok) => server.once("listening", ok));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

test("server: CSRF, body size, login rate limit, health, headers", async () => {
  const base = await start();
  const json = { "content-type": "application/json" };

  // A cross-site form can only send form-encoded or plain-text bodies: rejected.
  const form = await fetch(`${base}/api/users`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "email=a@x.co" });
  assert.equal(form.status, 415);
  const upload = await fetch(`${base}/api/_files`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
  assert.equal(upload.status, 415);

  const big = await fetch(`${base}/api/users`, { method: "POST", headers: json, body: JSON.stringify({ email: "x".repeat(2_000_000) }) });
  assert.equal(big.status, 413);

  await fetch(`${base}/api/_auth/signup`, { method: "POST", headers: json, body: JSON.stringify({ email: "a@x.co", password: "12345678" }) });
  const login = (password: string) => fetch(`${base}/api/_auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email: "a@x.co", password }) });
  for (let i = 0; i < 10; i++) assert.equal((await login("wrong")).status, 401);
  assert.equal((await login("12345678")).status, 429, "blocked even with the right password");

  assert.deepEqual(await (await fetch(`${base}/api/_health`)).json(), { ok: true });

  const page = await fetch(`${base}/`);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.match(page.headers.get("content-security-policy")!, /script-src 'self';/);
  assert.equal(page.headers.get("strict-transport-security"), null);
  const behindHttps = await fetch(`${base}/`, { headers: { "x-forwarded-proto": "https" } });
  assert.match(behindHttps.headers.get("strict-transport-security")!, /max-age=/);
});

test("server: a malformed URL answers 400 and the server keeps running", async () => {
  const base = await start();
  const { port } = new URL(base);
  for (const path of ["/%E0%A4%A", "/%ff"]) assert.equal((await fetch(base + path)).status, 400, path);
  assert.equal((await fetch(`${base}/api/%E0%A4%A`)).status, 404);
  // A request line whose target isn't a URL at all.
  const { connect } = await import("node:net");
  const raw = await new Promise<string>((ok) => {
    let out = "";
    const socket = connect(Number(port), "localhost", () => socket.end("GET http://[x HTTP/1.1\r\nHost: x\r\n\r\n"));
    socket.on("data", (d) => (out += d)).on("close", () => ok(out));
  });
  assert.match(raw, /^HTTP\/1\.1 400/);
  assert.deepEqual(await (await fetch(`${base}/api/_health`)).json(), { ok: true });
});

test("runtime: URLs from data can't run code", async () => {
  GlobalRegistrator.register();
  try {
    const a = document.createElement("a");
    const img = document.createElement("img");
    root(() => {
      $attr(a, "href", () => " JaVaScript:alert(1)");
      $attr(img, "src", () => "data:text/html,<script>x</script>");
    });
    assert.equal(a.getAttribute("href"), "#");
    assert.match(img.src, /#$/);
    root(() => $attr(a, "href", () => "/ok"));
    assert.equal(a.getAttribute("href"), "/ok");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("server: general rate limit per address, and Prometheus metrics", async () => {
  const { createApi } = await import("../runtime/server.js" as string);
  const { createServer } = await import("node:http");
  process.env.ART_RATE_LIMIT = "5";
  try {
    const api = createApi(compile([{ file: "a.art", src: SRC }]).server!, mkdtempSync(join(tmpdir(), "art-rl-")));
    const server = createServer(async (req: any, res: any) => { if (!(await api(req, res))) res.writeHead(404).end(); });
    servers.push(server as unknown as Server);
    await new Promise<void>((ok) => server.listen(0, ok));
    const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await fetch(`${base}/_health`)).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
    const metrics = await (await fetch(`${base}/_metrics`)).text();
    assert.match(metrics, /art_requests_total\{method="GET",status="200"\} 5/);
    assert.match(metrics, /art_requests_total\{method="GET",status="429"\} 2/);
  } finally {
    delete process.env.ART_RATE_LIMIT;
  }
});
