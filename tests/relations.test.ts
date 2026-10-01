// Relations: a stored model's field typed as another stored model keeps the id and reads as the row.
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

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

const SRC = `model Author {
  id: ID
  name: String
}

model Tag {
  id: ID
  label: String
}

model Post {
  id: ID
  title: String
  author: Author
  tags: Tag[]
}

model Comment {
  id: ID
  post: Post cascade
  text: String
}

api authors: Author

api tags: Tag

api posts: Post

api comments: Comment
`;

test("relations: canonical format; writes take the row or its id; cascade only on relations", () => {
  assert.equal(printProgram(parse(SRC, "t")), SRC);
  const page = (body: string) => `${SRC}\npage P {\n  data authors = api.authors.list()\n${body}\n}`;
  assert.deepEqual(types(page('  button "x" -> api.posts.create({ title: "t", author: authors[0], tags: [] })')), []);
  assert.deepEqual(types(page('  button "x" -> api.posts.create({ title: "t", author: authors[0].id, tags: ["a"] })')), []);
  assert.deepEqual(types(page('  data mine = api.posts.list({ where: { author: "1" } })\n  text mine[0].author.name')), []);
  assert.deepEqual(types(page('  button "x" -> api.posts.create({ title: "t", author: 3, tags: [] })')), ["TYPE_MISMATCH"]);
  assert.deepEqual(types("model A {\n  id: ID\n  n: Number cascade\n}\napi as: A"), ["TYPE_MISMATCH"]);
});

const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

test("relations: stored as ids, read as rows, deletes blocked or cascaded", async () => {
  const api = createApi(compile([{ file: "a.art", src: SRC }]).server!, mkdtempSync(join(tmpdir(), "art-rel-")));
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}/${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };

  const ana = (await call("POST", "authors", { name: "Ana" })).body;
  const tag = (await call("POST", "tags", { label: "news" })).body;
  // The author as a row, the tags as ids.
  const post = await call("POST", "posts", { title: "Hi", author: ana, tags: [tag.id] });
  assert.equal(post.status, 201);
  assert.deepEqual(post.body.author, ana);
  assert.deepEqual(post.body.tags, [tag]);
  const listed = (await call("GET", "posts")).body;
  assert.equal(listed[0].author.name, "Ana");
  // Filtering by the related id.
  assert.equal((await call("GET", `posts?q=${encodeURIComponent(JSON.stringify({ where: { author: ana.id } }))}`)).body.length, 1);

  const missing = await call("POST", "posts", { title: "x", author: "nope", tags: [] });
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /invalid author: authors\/nope does not exist/);

  // Deleting an author used by a post is refused and changes nothing.
  const blocked = await call("DELETE", `authors/${ana.id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /used by 1 row\(s\) of posts \(author\).*cascade/);
  assert.equal((await call("GET", "authors")).body.length, 1);

  // Comments are `cascade`: deleting the post deletes its comments.
  await call("POST", "comments", { post: post.body.id, text: "first" });
  assert.equal((await call("GET", "comments")).body[0].post.title, "Hi");
  assert.equal((await call("DELETE", `posts/${post.body.id}`)).status, 204);
  assert.deepEqual((await call("GET", "comments")).body, []);
  assert.equal((await call("DELETE", `authors/${ana.id}`)).status, 204);
});
