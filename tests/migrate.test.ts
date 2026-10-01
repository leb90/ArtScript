// Field defaults and migrations: when a model changes, existing rows follow it on the next start.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

// Calls the api handler in-process with a fake request/response.
async function call(api: any, method: string, path: string, body?: unknown) {
  const { Readable } = await import("node:stream");
  const req: any = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url: `/api/${path}`, headers: { "content-type": "application/json" } });
  let status = 0, out = "";
  const res: any = { writeHead(s: number) { status = s; return res; }, setHeader() {}, end(b?: string) { out = b ?? ""; } };
  await api(req, res);
  return { status, body: out ? JSON.parse(out) : null };
}

const V1 = "model Product {\n  id: ID\n  name: String\n  color: String\n}\n\napi products: Product\n";

test("field defaults: syntax, types, and optional on create", () => {
  const src = 'model Product {\n  id: ID\n  name: String\n  stock: Number = 0 min=0\n  tags: String[] = []\n  title: String = "" was="name2"\n}\n\napi products: Product\n';
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src + 'page P {\n  button "x" -> api.products.create({ name: "a" })\n}'), []);
  assert.deepEqual(types('model A {\n  id: ID\n  n: Number = "x"\n}'), ["TYPE_MISMATCH"]);
  assert.deepEqual(types("model A {\n  id: ID\n  n: Number = Date.now()\n}"), ["TYPE_MISMATCH"]);
});

test("migrations: add with default, rename, drop; backup; required without default stops", async () => {
  const dir = mkdtempSync(join(tmpdir(), "art-migrate-"));
  const v1 = createApi(compile([{ file: "a.art", src: V1 }]).server!, dir);
  assert.equal((await call(v1, "POST", "products", { name: "Mesa", color: "red" })).status, 201);
  assert.equal(readdirSync(dir).filter((f) => f.startsWith("art-backup")).length, 0, "nothing to migrate the first time");

  // v2: `name` renamed to `title`, `color` removed, `stock` added with a default, `notes` optional.
  const V2 = 'model Product {\n  id: ID\n  title: String was="name"\n  stock: Number = 5\n  notes: String?\n}\n\napi products: Product\n';
  const v2 = createApi(compile([{ file: "a.art", src: V2 }]).server!, dir);
  const [row] = (await call(v2, "GET", "products")).body;
  assert.deepEqual(Object.keys(row).sort(), ["id", "stock", "title"]);
  assert.equal(row.title, "Mesa");
  assert.equal(row.stock, 5);
  assert.equal((await call(v2, "PATCH", `products/${row.id}`, { stock: 2 })).status, 200, "migrated rows validate");
  assert.equal((await call(v2, "POST", "products", { title: "Silla" })).body.stock, 5, "the default on create");
  assert.equal(readdirSync(dir).filter((f) => f.startsWith("art-backup")).length, 1, "a backup before changing rows");

  // v3: a required field without a default can't be filled in: the server explains.
  const V3 = V2.replace("notes: String?", "sku: String");
  assert.throws(() => createApi(compile([{ file: "a.art", src: V3 }]).server!, dir), /rows without 'sku'.*sku: String = \.\.\..*sku: String\?/);
});
