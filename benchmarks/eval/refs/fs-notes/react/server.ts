import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

type User = { id: string; email: string; salt: string; hash: string };
type Note = { id: string; owner: string; text: string };
const users: User[] = [];
const notes: Note[] = [];
const sessions = new Map<string, string>(); // token -> user id

const hashOf = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const body = async () => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
  };
  const token = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const me = users.find((u) => u.id === sessions.get(token ?? ""));
  const start = (user: User) => {
    const t = randomBytes(24).toString("hex");
    sessions.set(t, user.id);
    send(200, { email: user.email }, { "set-cookie": `session=${t}; HttpOnly; Path=/; SameSite=Lax` });
  };

  if (url.pathname === "/api/me" && req.method === "GET") return send(200, me ? { email: me.email } : null);
  if (url.pathname === "/api/signup" && req.method === "POST") {
    const { email, password } = await body();
    if (typeof email !== "string" || typeof password !== "string" || !email.includes("@") || password.length < 8) return send(400, { error: "invalid" });
    if (users.some((u) => u.email === email)) return send(409, { error: "exists" });
    const salt = randomBytes(16).toString("hex");
    const user = { id: randomUUID(), email, salt, hash: hashOf(password, salt) };
    users.push(user);
    return start(user);
  }
  if (url.pathname === "/api/login" && req.method === "POST") {
    const { email, password } = await body();
    const user = users.find((u) => u.email === email);
    if (!user || typeof password !== "string" || !timingSafeEqual(Buffer.from(hashOf(password, user.salt)), Buffer.from(user.hash))) return send(401, { error: "Datos incorrectos" });
    return start(user);
  }
  if (url.pathname === "/api/logout" && req.method === "POST") {
    if (token) sessions.delete(token);
    return send(200, { ok: true }, { "set-cookie": "session=; HttpOnly; Path=/; Max-Age=0" });
  }
  if (url.pathname === "/api/notes") {
    if (!me) return send(401, { error: "login required" });
    if (req.method === "GET") return send(200, notes.filter((n) => n.owner === me.id));
    if (req.method === "POST") {
      const { text } = await body();
      if (typeof text !== "string") return send(400, { error: "text required" });
      const note = { id: randomUUID(), owner: me.id, text };
      notes.push(note);
      return send(201, note);
    }
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
