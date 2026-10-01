import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

type Author = { id: string; name: string };
type Post = { id: string; title: string; authorId: string };
const authors: Author[] = [];
const posts: Post[] = [];

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const body = async () => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    return JSON.parse(raw || "{}");
  };
  if (url.pathname === "/api/authors" && req.method === "GET") return send(200, authors);
  if (url.pathname === "/api/authors" && req.method === "POST") {
    const { name } = await body();
    const author = { id: randomUUID(), name: String(name) };
    authors.push(author);
    return send(201, author);
  }
  const a = url.pathname.match(/^\/api\/authors\/(.+)$/);
  if (a && req.method === "DELETE") {
    if (posts.some((p) => p.authorId === a[1])) return send(409, { error: "El autor tiene posts" });
    const i = authors.findIndex((x) => x.id === a[1]);
    if (i >= 0) authors.splice(i, 1);
    return send(204);
  }
  if (url.pathname === "/api/posts" && req.method === "GET") {
    return send(200, posts.map((p) => ({ ...p, author: authors.find((x) => x.id === p.authorId) ?? null })));
  }
  if (url.pathname === "/api/posts" && req.method === "POST") {
    const { title, authorId } = await body();
    if (!authors.some((x) => x.id === authorId)) return send(400, { error: "autor inexistente" });
    const post = { id: randomUUID(), title: String(title), authorId };
    posts.push(post);
    return send(201, post);
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
