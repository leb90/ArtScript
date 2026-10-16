// Static files served by `serve()` (dist/) and `art dev` (public/): content types from one map.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { serve } from "../runtime/server.js";

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

test("static files: .mjs (and other common files) get a content type browsers accept", async () => {
  const dir = mkdtempSync(join(tmpdir(), "art-static-"));
  mkdirSync(join(dir, "vendor"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><div id=app></div>");
  writeFileSync(join(dir, "vendor", "lib.mjs"), "export const x = 1;");
  writeFileSync(join(dir, "font.woff2"), "x");
  writeFileSync(join(dir, "app.js.map"), "{}");
  const schema = compile([{ file: "a.art", src: "model N {\n  id: ID\n}\n\napi ns: N\n" }]).server!;
  const server: Server = serve(schema, {}, pathToFileURL(dir + "/"), 0);
  servers.push(server);
  await new Promise((ok) => server.once("listening", ok));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const type = async (path: string) => (await fetch(base + path)).headers.get("content-type");
  assert.equal(await type("/vendor/lib.mjs"), "text/javascript");
  assert.equal(await type("/font.woff2"), "font/woff2");
  assert.equal(await type("/app.js.map"), "application/json");
});

test("static files: art dev and the server use the same map", async () => {
  // @ts-ignore: runtime is plain JS
  const { TYPES } = await import("../runtime/mime.js");
  const cli = (await import("node:fs")).readFileSync("src/cli.ts", "utf8");
  assert.match(cli, /from "\.\.\/runtime\/mime\.js"/);
  assert.equal(TYPES[".mjs"], "text/javascript");
});
