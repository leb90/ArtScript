import { createServer } from "node:http";

let photo: { type: string; data: Buffer; version: number } | null = null;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/avatar" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { type, data } = JSON.parse(raw);
    photo = { type: String(type), data: Buffer.from(String(data), "base64"), version: (photo?.version ?? 0) + 1 };
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === "/api/avatar" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(photo ? { url: `/api/avatar/raw?v=${photo.version}` } : null));
    return;
  }
  if (url.pathname === "/api/avatar/raw" && photo) {
    res.writeHead(200, { "content-type": photo.type }).end(photo.data);
    return;
  }
  res.writeHead(404).end();
}).listen(Number(process.env.PORT));
