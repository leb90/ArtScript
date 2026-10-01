import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

type Product = { id: string; name: string; code: string; price: number };
const products: Product[] = [];

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  if (url.pathname === "/api/products" && req.method === "GET") return send(200, products);
  if (url.pathname === "/api/products" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { name, code, price } = JSON.parse(raw || "{}");
    if (typeof name !== "string" || name.length < 3) return send(400, { error: "Nombre muy corto" });
    if (products.some((p) => p.code === code)) return send(409, { error: "Código repetido" });
    if (typeof price !== "number" || price < 0) return send(400, { error: "Precio inválido" });
    const product = { id: randomUUID(), name, code: String(code), price };
    products.push(product);
    return send(201, product);
  }
  send(404, { error: "not found" });
}).listen(Number(process.env.PORT));
