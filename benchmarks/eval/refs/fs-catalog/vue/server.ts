import { createServer } from "node:http";

type Product = { id: number; name: string };
const products: Product[] = [];
const PAGE = 5;

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
  if (url.pathname === "/api/seed" && req.method === "POST") {
    if (!products.length) for (let n = 1; n <= 12; n++) products.push({ id: n, name: `Producto ${n}` });
    return send(200, { ok: true });
  }
  if (url.pathname === "/api/products" && req.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const page = Number(url.searchParams.get("page") ?? 0);
    const found = products.filter((p) => p.name.toLowerCase().includes(q));
    return send(200, { items: found.slice(page * PAGE, page * PAGE + PAGE), total: found.length });
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
