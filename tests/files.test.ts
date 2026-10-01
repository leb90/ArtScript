// File uploads: `File` fields, the client uploading browser Files in create/update, server checks.
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
import { $api, setApiBase } from "../runtime/runtime.js";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

const SRC = `model Post {
  id: ID
  title: String
  photo: File? max=100 accept="image/*"
  docs: File[] = []
}

api posts: Post
`;

test("File fields: syntax, rules and types", () => {
  assert.equal(printProgram(parse(SRC, "t")), SRC);
  assert.deepEqual(types(SRC + "page P {\n  data posts = api.posts.list()\n  state picked = null\n\n  file picked accept=\"image/*\"\n  button \"x\" -> api.posts.create({ title: \"t\", photo: picked })\n  for p in posts {\n    image p.photo?.url ?? \"\"\n    text `${p.photo?.name} ${p.photo?.size}`\n  }\n}"), []);
  assert.deepEqual(types("model A {\n  id: ID\n  f: File min=1\n}"), ["TYPE_MISMATCH"]);
  assert.deepEqual(types('model A {\n  id: ID\n  s: String accept="image/*"\n}'), ["TYPE_MISMATCH"]);
});

const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

test("uploads: the client uploads Files, the server checks size and type and serves them safely", async () => {
  const api = createApi(compile([{ file: "a.art", src: SRC }]).server!, mkdtempSync(join(tmpdir(), "art-files-")));
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  setApiBase(base);
  const posts = $api("posts");

  const png = new File(["fake png bytes"], "cat.png", { type: "image/png" });
  const post = await posts.create({ title: "Cat", photo: png, docs: [new File(["a"], "a.txt", { type: "text/plain" })] });
  assert.equal(post.photo.name, "cat.png");
  assert.equal(post.photo.type, "image/png");
  assert.equal(post.photo.size, 14);
  assert.equal(post.docs[0].name, "a.txt");
  const got = await fetch(base + post.photo.url);
  assert.equal(got.headers.get("content-type"), "image/png");
  assert.equal(await got.text(), "fake png bytes");

  await assert.rejects(posts.create({ title: "Big", photo: new File(["x".repeat(200)], "big.png", { type: "image/png" }) }), /at most 100 bytes, got 200/);
  await assert.rejects(posts.create({ title: "Doc", photo: new File(["x"], "a.pdf", { type: "application/pdf" }) }), /expected image\/\*, got application\/pdf/);
  // A made-up descriptor isn't a file the server has; size and type come from the server anyway.
  await assert.rejects(posts.create({ title: "Fake", photo: { url: "/api/_files/nope", name: "x.png", type: "image/png", size: 1 } }), /expected an uploaded file/);

  // An uploaded page is downloaded, never rendered as this site.
  const up = await (await fetch(`${base}/api/_files`, { method: "POST", headers: { "content-type": "text/html", "x-file-name": "x.html" }, body: "<script>alert(1)</script>" })).json();
  const html = await fetch(base + up.url);
  assert.match(html.headers.get("content-disposition")!, /^attachment/);
  assert.equal(html.headers.get("content-security-policy"), "sandbox");
});
