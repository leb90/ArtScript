import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

type Task = { id: string; title: string; done: boolean };
const tasks: Task[] = [];

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
  if (url.pathname === "/api/tasks" && req.method === "GET") return send(200, tasks);
  if (url.pathname === "/api/tasks" && req.method === "POST") {
    const { title } = await body();
    if (typeof title !== "string") return send(400, { error: "title required" });
    const task = { id: randomUUID(), title, done: false };
    tasks.push(task);
    return send(201, task);
  }
  const m = url.pathname.match(/^\/api\/tasks\/(.+)$/);
  if (m && req.method === "PATCH") {
    const task = tasks.find((t) => t.id === m[1]);
    if (!task) return send(404, { error: "not found" });
    const { title, done } = await body();
    if (typeof title === "string") task.title = title;
    if (typeof done === "boolean") task.done = done;
    return send(200, task);
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
