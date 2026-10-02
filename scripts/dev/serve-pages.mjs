// A stand-in for GitHub Pages: serves site/ under /ArtScript/ (folders → index.html with a
// trailing-slash redirect, unknown paths → 404.html), to check the built website locally.
//   node scripts/dev/serve-pages.mjs [site] [port]     → http://localhost:4173/ArtScript/
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const root = process.argv[2] ?? "site", port = Number(process.argv[3] ?? 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".md": "text/markdown", ".xml": "application/xml" };
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/ArtScript")) return void res.writeHead(404).end("outside /ArtScript");
  let f = join(root, decodeURIComponent(url.pathname.slice("/ArtScript".length)));
  if (existsSync(f) && statSync(f).isDirectory()) {
    if (!url.pathname.endsWith("/")) return void res.writeHead(301, { location: url.pathname + "/" + url.search }).end();
    f = join(f, "index.html");
  }
  if (!existsSync(f)) return void res.writeHead(404, { "content-type": "text/html" }).end(readFileSync(join(root, "404.html")));
  res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
}).listen(port, () => console.log(`http://localhost:${port}/ArtScript/`));
