import { createServer } from "node:http";

const OPTIONS = ["Perros", "Gatos"];
let votes: string[] = [];

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
  if (url.pathname === "/api/results" && req.method === "GET") {
    return send(200, OPTIONS.map((option) => {
      const count = votes.filter((v) => v === option).length;
      return { option, votes: count, percent: votes.length ? Math.round((count * 100) / votes.length) : 0 };
    }));
  }
  if (url.pathname === "/api/votes" && req.method === "POST") {
    const { option } = await body();
    if (!OPTIONS.includes(option)) return send(400, { error: "unknown option" });
    votes.push(option);
    return send(201, { ok: true });
  }
  if (url.pathname === "/api/votes" && req.method === "DELETE") {
    votes = [];
    return send(204);
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
