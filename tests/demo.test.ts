// `art build --demo`: the api, accounts and server fns answered in the browser (runtime/demo.js).
// The same requests are sent to the real server and to the demo backend: the answers must match.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const SRC = `model User {
  id: ID
  email: Email
  password: String
  role: String = "user"
}

model Author {
  id: ID
  name: String min=2 unique
}

model Post {
  id: ID
  title: String min=3
  views: Number = 0
  author: Author
  tags: String[]
}

model Note {
  id: ID
  owner: ID
  text: String
}

model Order {
  id: ID
  owner: ID
  total: Number
}

api users: User

api authors: Author

api posts: Post

api notes: Note private

api orders: Order private readonly

auth users

server fn buy(total) {
  if !me { fail("log in first", 401) }
  return db.orders.create({ owner: me.id, total })
}

server fn stats() {
  return { posts: db.posts.count(), top: db.posts.list({ sort: "-views", limit: 1 }).map(p => p.title) }
}

page P "/" {
  text "x"
}
`;

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

// One client against the real server (cookies kept by hand), one against the demo backend.
async function clients() {
  const r = compile([{ file: "app.art", src: SRC }]);
  assert.deepEqual(r.diagnostics, []);
  const { fns: code, ...schema } = r.server!;
  const dir = mkdtempSync(join(tmpdir(), "art-demo-"));
  writeFileSync(join(dir, "fns.mjs"), code);
  const { fns } = await import(join(dir, "fns.mjs"));
  const api = createApi(r.server!, join(dir, "data"), fns);
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  await new Promise<void>((ok) => server.listen(0, ok));
  servers.push(server);
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  let cookie = "";
  const real = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api/${path}`, { method, headers: { ...(body === undefined && method === "GET" ? {} : { "content-type": "application/json" }), cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return [res.status, res.status === 204 ? null : await res.json()] as const;
  };

  // The demo backend, in a minimal "browser".
  const storage = new Map<string, string>();
  const g = globalThis as any;
  const saved = { fetch: g.fetch }; // the demo keeps using the "browser's" location and storage
  g.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) };
  g.location = new URL("http://demo.local/");
  g.document = { body: null, addEventListener() {} };
  // @ts-ignore: runtime is plain JS
  const { installDemo } = await import("../runtime/demo.js");
  installDemo(schema, fns, {}, "");
  const demoFetch = g.fetch;
  Object.assign(g, saved);
  const demo = async (method: string, path: string, body?: unknown) => {
    const res: Response = await demoFetch(`http://demo.local/api/${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return [res.status, res.status === 204 ? null : await res.json()] as const;
  };
  return { real, demo, storage };
}

// Ids are random on both sides: compared by shape, with ids replaced by their order of appearance.
function normalize(v: unknown, ids = new Map<string, string>()): unknown {
  if (typeof v === "string") return v.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{20,}/g, (id) => ids.get(id) ?? (ids.set(id, `id${ids.size}`), ids.get(id)!));
  if (Array.isArray(v)) return v.map((x) => normalize(x, ids));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x, ids)]));
  return v;
}

test("demo backend: the same answers as the server", async () => {
  const { real, demo, storage } = await clients();
  const idsA = new Map<string, string>(), idsB = new Map<string, string>();
  const made: Record<string, [string, string]> = {};
  // Every step is sent to both; `$name` in a path or body is the id that step `name` created on each side.
  const steps: [string, string, unknown?, string?][] = [
    ["GET", "posts"],
    ["POST", "authors", { name: "Ana" }, "ana"],
    ["POST", "authors", { name: "Ana" }], // unique → 409
    ["POST", "authors", { name: "B" }], // min → 400
    ["POST", "authors", { name: "Beto" }, "beto"],
    ["POST", "posts", { title: "Hello world", author: "$ana", views: 5 }, "p1"],
    ["POST", "posts", { title: "Second post", author: "$beto", tags: ["x"] }, "p2"],
    ["POST", "posts", { title: "No", author: "$ana" }], // min
    ["POST", "posts", { title: "Ghost author", author: "nope" }], // relation must exist
    ["POST", "posts", { title: "Extra field", author: "$ana", nope: 1 }],
    ["GET", "posts"],
    ["GET", `posts?q=${encodeURIComponent(JSON.stringify({ where: { author: "$ana" } }))}`],
    ["GET", `posts?q=${encodeURIComponent(JSON.stringify({ search: "SECOND" }))}`],
    ["GET", `posts?q=${encodeURIComponent(JSON.stringify({ sort: "-views", limit: 1 }))}`],
    ["GET", `posts?q=${encodeURIComponent(JSON.stringify({ sort: "title", offset: 1 }))}`],
    ["GET", `posts?q=${encodeURIComponent(JSON.stringify({ where: { nope: 1 } }))}`],
    ["GET", `posts/_count?q=${encodeURIComponent(JSON.stringify({ where: { views: 0 } }))}`],
    ["GET", "posts/$p1"],
    ["GET", "posts/missing"],
    ["PATCH", "posts/$p1", { views: 9 }],
    ["DELETE", "authors/$ana"], // referenced → 409
    ["DELETE", "posts/$p1"],
    ["DELETE", "authors/$ana"],
    ["GET", "authors"],
    // Accounts and access.
    ["GET", "notes"], // 401
    ["GET", "_auth/me"],
    ["POST", "_auth/signup", { email: "ana@x.co", password: "short" }],
    ["POST", "_auth/signup", { email: "ana@x.co", password: "secret123", role: "admin" }, "u1"],
    ["GET", "_auth/me"],
    ["POST", "notes", { text: "mine" }, "n1"],
    ["POST", "orders", { total: 5 }], // readonly → 403
    ["POST", "_fn/buy", { args: [42] }],
    ["GET", "orders"],
    ["POST", "_fn/stats", { args: [] }],
    ["POST", "_auth/logout"],
    ["POST", "_fn/buy", { args: [1] }], // fail() → 401
    ["POST", "_auth/signup", { email: "ana@x.co", password: "secret123" }], // taken
    ["POST", "_auth/signup", { email: "beto@x.co", password: "secret123" }, "u2"],
    ["GET", "notes"], // Beto doesn't see Ana's
    ["GET", "notes/$n1"], // nor can he fetch it
    ["PATCH", "users/$u1", { email: "x@x.co" }], // not his account
    ["PATCH", "users/$u2", { role: "admin" }], // nor his role
    ["POST", "_auth/logout"],
    ["POST", "_auth/login", { email: "ana@x.co", password: "wrong-one" }],
    ["POST", "_auth/login", { email: "ana@x.co", password: "secret123" }],
    ["GET", "notes"],
    ["GET", "users"],
  ];
  const fill = (v: unknown, side: 0 | 1): any => JSON.parse(JSON.stringify(v ?? null).replace(/\$(\w+)/g, (m, name) => made[name]?.[side] ?? m));
  for (const [method, path, body, name] of steps) {
    const sub = (side: 0 | 1) => path.replace(/\$(\w+)/g, (m, n) => made[n]?.[side] ?? m).replace(/%24(\w+)/g, (m, n) => made[n]?.[side] ?? m);
    const a = await real(method, sub(0), body === undefined ? undefined : fill(body, 0));
    const b = await demo(method, sub(1), body === undefined ? undefined : fill(body, 1));
    if (name) made[name] = [(a[1] as any)?.id, (b[1] as any)?.id];
    assert.deepEqual(normalize(b, idsB), normalize(a, idsA), `${method} ${path}`);
  }
  // The demo's data is in the visitor's storage, passwords not in plain sight.
  const stored = [...storage.values()].join("");
  assert.match(stored, /"notes":\[/);
  assert.doesNotMatch(stored, /secret123/);
});

test("art build --demo: static files with the backend inside, no server", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-demo-build-"));
  writeFileSync(join(dir, "app.art"), SRC);
  const out = execFileSync(process.execPath, ["src/cli.ts", "build", dir, "--demo"], { encoding: "utf8" });
  assert.match(out, /run in the visitor's browser/);
  assert.ok(!existsSync(join(dir, "dist", "server.js")));
  assert.equal(readFileSync(join(dir, "dist", "_redirects"), "utf8"), "/* /index.html 200\n");
  const js = readFileSync(join(dir, "dist", "app.js"), "utf8");
  assert.match(js, /art-demo:/);
  assert.match(js, /log in first/, "the server fns are in the bundle");
  // A normal build has none of it.
  execFileSync(process.execPath, ["src/cli.ts", "build", dir], { encoding: "utf8" });
  assert.doesNotMatch(readFileSync(join(dir, "dist", "app.js"), "utf8"), /art-demo:/);
  assert.ok(existsSync(join(dir, "dist", "server.js")));
});
