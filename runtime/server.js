// ArtScript server runtime: REST apis generated from models, with validation and JSON-file storage.
// Node only, no dependencies. `art dev` mounts createApi in its dev server; `art build` emits a
// server.js that calls serve().
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns { field, expected, actual } if `value` doesn't match `type` ("String", "User[]", "Email?"), else null.
export function validate(schema, type, value, path = "") {
  if (type.endsWith("?")) {
    if (value === null || value === undefined) return null;
    type = type.slice(0, -1);
  }
  const fail = (expected, actual) => ({ field: path || "(body)", expected, actual });
  const kind = value === null || value === undefined ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (kind === "null") return fail(type, "null");
  if (type.endsWith("[]")) {
    if (kind !== "array") return fail(type, kind);
    for (let i = 0; i < value.length; i++) {
      const e = validate(schema, type.slice(0, -2), value[i], `${path}[${i}]`);
      if (e) return e;
    }
    return null;
  }
  switch (type) {
    case "String": case "ID": return kind === "string" ? null : fail(type, kind);
    case "Email": return kind === "string" && EMAIL.test(value) ? null : fail("Email", kind === "string" ? JSON.stringify(value) : kind);
    case "Number": return kind === "number" && Number.isFinite(value) ? null : fail("Number", kind);
    case "Bool": return kind === "boolean" ? null : fail("Bool", kind);
    case "Date": case "Any": case "Fn": return null;
  }
  const model = schema.models[type];
  if (!model) return null;
  if (kind !== "object") return fail(type, kind);
  for (const k of Object.keys(value)) if (!(k in model)) return { field: path ? `${path}.${k}` : k, expected: `a field of ${type}`, actual: "unknown field" };
  for (const [k, t] of Object.entries(model)) {
    const e = validate(schema, t, value[k], path ? `${path}.${k}` : k);
    if (e) return e;
  }
  return null;
}

// The primary key of a model: its first `ID` field.
export const idField = (model) => Object.keys(model).find((k) => model[k] === "ID") ?? null;

function send(res, status, body) {
  if (body === undefined) return res.writeHead(status).end();
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// Returns an async (req, res) => boolean handler; true when the request was an /api/ call.
export function createApi(schema, dataDir) {
  const tables = {};
  for (const [name, modelName] of Object.entries(schema.apis)) {
    const file = join(dataDir, `${name}.json`);
    const rows = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    const save = () => { mkdirSync(dataDir, { recursive: true }); writeFileSync(file, JSON.stringify(rows, null, 2) + "\n"); };
    tables[name] = { modelName, key: idField(schema.models[modelName] ?? {}), rows, save };
  }

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const m = /^\/api\/([\w-]+)(?:\/([^/]+))?\/?$/.exec(url.pathname);
    if (!m) return false;
    const t = tables[m[1]];
    if (!t) return send(res, 404, { error: "NOT_FOUND", message: `no api named '${m[1]}'` }), true;
    const id = m[2] === undefined ? null : decodeURIComponent(m[2]);
    const index = id === null ? -1 : t.rows.findIndex((r) => String(r[t.key]) === id);
    let body;
    if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
      try { body = await readJson(req); } catch { return send(res, 400, { error: "BAD_JSON", message: "invalid JSON body" }), true; }
      if (typeof body !== "object" || body === null || Array.isArray(body)) return send(res, 400, { error: "VALIDATION", field: "(body)", expected: t.modelName, actual: typeof body }), true;
    }
    const invalid = (row) => {
      const e = validate(schema, t.modelName, row);
      return e && (send(res, 400, { error: "VALIDATION", message: `invalid ${e.field}: expected ${e.expected}, got ${e.actual}`, ...e }), true);
    };

    if (req.method === "GET" && id === null) return send(res, 200, t.rows), true;
    if (id !== null && index < 0 && req.method !== "POST") return send(res, 404, { error: "NOT_FOUND", message: `${m[1]}/${id} does not exist` }), true;
    if (req.method === "GET") return send(res, 200, t.rows[index]), true;
    if (req.method === "POST" && id === null) {
      const row = { ...body };
      if (t.key && (row[t.key] === undefined || row[t.key] === null)) row[t.key] = randomUUID();
      if (invalid(row)) return true;
      if (t.key && t.rows.some((r) => r[t.key] === row[t.key])) return send(res, 409, { error: "CONFLICT", message: `${t.key} '${row[t.key]}' already exists` }), true;
      t.rows.push(row);
      t.save();
      return send(res, 201, row), true;
    }
    if (req.method === "PATCH" || req.method === "PUT") {
      // The key never changes; PATCH merges, PUT replaces.
      const row = { ...(req.method === "PATCH" ? t.rows[index] : {}), ...body, ...(t.key ? { [t.key]: t.rows[index][t.key] } : {}) };
      if (invalid(row)) return true;
      t.rows[index] = row;
      t.save();
      return send(res, 200, row), true;
    }
    if (req.method === "DELETE") {
      t.rows.splice(index, 1);
      t.save();
      return send(res, 204), true;
    }
    return send(res, 405, { error: "METHOD_NOT_ALLOWED", message: `${req.method} not allowed here` }), true;
  };
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const PRIVATE = new Set(["server.js", "server-runtime.js"]);

// Production server: the apis plus the built static files. Data lives in ART_DATA_DIR (default ./data).
export function serve(schema, rootUrl, port = Number(process.env.PORT ?? 3000)) {
  const root = resolve(fileURLToPath(rootUrl));
  const dataDir = resolve(process.env.ART_DATA_DIR ?? join(root, "data"));
  const api = createApi(schema, dataDir);
  const server = createServer(async (req, res) => {
    if (await api(req, res)) return;
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    let file = resolve(root, "." + path);
    const blocked = !file.startsWith(root + sep) && file !== root || file.startsWith(dataDir + sep) || PRIVATE.has(basename(file));
    // Unknown paths fall back to index.html (client-side routing).
    if (blocked || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  server.listen(port, () => console.log(`ArtScript server → http://localhost:${port}`));
  return server;
}
