import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

type User = { id: string; name: string; email: string };
const users: User[] = [];

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  if (url.pathname === "/api/users" && req.method === "GET") return send(200, users);
  if (url.pathname === "/api/users" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { name, email } = JSON.parse(raw);
    if (typeof name !== "string" || typeof email !== "string" || !email.includes("@")) return send(400, { error: "Email inválido" });
    const user = { id: randomUUID(), name, email };
    users.push(user);
    return send(201, user);
  }
  const m = url.pathname.match(/^\/api\/users\/(.+)$/);
  if (m && req.method === "DELETE") {
    const i = users.findIndex((u) => u.id === m[1]);
    if (i >= 0) users.splice(i, 1);
    return send(204);
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
