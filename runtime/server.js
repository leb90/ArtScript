// ArtScript server runtime: REST apis generated from models (validation, JSON-file storage),
// email + password auth with cookie sessions, per-user private data and server functions.
// Node only, no dependencies. `art dev` mounts createApi in its dev server; `art build` emits a
// server.js that calls serve().
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE = "art_session";
const MIN_PASSWORD = 8;

// An error with an HTTP status; its body is sent as JSON. `fail(message)` in server fns throws one.
export class HttpError extends Error {
  constructor(status, error, message, extra = {}) {
    super(message);
    this.status = status;
    this.body = { error, message, ...extra };
  }
}

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

// ---------- passwords ----------
const isHashed = (p) => typeof p === "string" && p.startsWith("scrypt$");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}
export function checkPassword(password, stored) {
  if (!isHashed(stored) || typeof password !== "string") return false;
  const [, salt, hash] = stored.split("$");
  const a = Buffer.from(hash, "hex"), b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- storage ----------
function loadJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
}
function saveJson(dir, file, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

// A table: validated CRUD over one api's rows. `ctx.me` scopes private apis to their owner.
function makeTable(schema, dataDir, name, { model, access }) {
  const file = join(dataDir, `${name}.json`);
  const rows = loadJson(file, []);
  const fields = schema.models[model] ?? {};
  const key = idField(fields);
  const isAuth = schema.auth === name;
  const save = () => saveJson(dataDir, file, rows);
  const visible = (row, me) => access !== "private" || (me && row.owner === me[idField(schema.models[schema.apis[schema.auth].model])]);
  // Auth passwords never leave the server.
  const out = (row) => {
    if (!isAuth || !row) return row ?? null;
    const { password, ...rest } = row;
    return rest;
  };
  const check = (row) => {
    const e = validate(schema, model, row);
    if (e) throw new HttpError(400, "VALIDATION", `invalid ${e.field}: expected ${e.expected}, got ${e.actual}`, e);
    if (isAuth && !isHashed(row.password)) {
      if (row.password.length < MIN_PASSWORD) throw new HttpError(400, "VALIDATION", `invalid password: expected at least ${MIN_PASSWORD} characters`, { field: "password", expected: `String (min ${MIN_PASSWORD})`, actual: `${row.password.length} characters` });
      row.password = hashPassword(row.password);
    }
    if (isAuth && rows.some((r) => r.email === row.email && r[key] !== row[key])) throw new HttpError(409, "CONFLICT", `email '${row.email}' is already registered`);
  };
  const find = (id, me) => {
    const i = rows.findIndex((r) => String(r[key]) === String(id) && visible(r, me));
    if (i < 0) throw new HttpError(404, "NOT_FOUND", `${name}/${id} does not exist`);
    return i;
  };
  return {
    name, model, access, key, isAuth, rows, out,
    list: (me) => rows.filter((r) => visible(r, me)).map(out),
    get: (id, me) => out(rows[find(id, me)]),
    create(body, me) {
      const row = { ...body };
      if (key && (row[key] === undefined || row[key] === null)) row[key] = randomUUID();
      if (access === "private" && me) row.owner = me[idField(schema.models[schema.apis[schema.auth].model])];
      check(row);
      if (key && rows.some((r) => r[key] === row[key])) throw new HttpError(409, "CONFLICT", `${key} '${row[key]}' already exists`);
      rows.push(row);
      save();
      return out(row);
    },
    // The key and the owner never change; `replace` (PUT) drops omitted fields, update (PATCH) merges.
    update(id, changes, me, replace = false) {
      const i = find(id, me);
      const fixed = { ...(key ? { [key]: rows[i][key] } : {}), ...(access === "private" ? { owner: rows[i].owner } : {}) };
      const row = { ...(replace ? {} : rows[i]), ...changes, ...fixed };
      if (isAuth && changes.password === undefined && !replace) row.password = rows[i].password;
      check(row);
      rows[i] = row;
      save();
      return out(row);
    },
    remove(id, me) {
      rows.splice(find(id, me), 1);
      save();
      return null;
    },
  };
}

function send(res, status, body, headers = {}) {
  if (body === undefined) return res.writeHead(status, headers).end();
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "BAD_JSON", "invalid JSON body"); }
}

const cookieOf = (req) => Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter((p) => p.length === 2))[COOKIE];

// Returns an async (req, res) => boolean handler; true when the request was an /api/ call.
// `fns`: the compiled server functions ({ name: async ({ db, me, fail }, ...args) => any }).
export function createApi(schema, dataDir, fns = {}) {
  const tables = Object.fromEntries(Object.entries(schema.apis).map(([n, a]) => [n, makeTable(schema, dataDir, n, a)]));
  const users = schema.auth ? tables[schema.auth] : null;
  const sessionsFile = join(dataDir, "_sessions.json");
  const sessions = loadJson(sessionsFile, {});
  const saveSessions = () => saveJson(dataDir, sessionsFile, sessions);

  const currentUser = (req) => {
    const token = cookieOf(req);
    const id = token && sessions[token];
    return (id && users?.rows.find((r) => r[users.key] === id)) || null;
  };
  const startSession = (res, user) => {
    const token = randomBytes(24).toString("hex");
    sessions[token] = user[users.key];
    saveSessions();
    return { "set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` };
  };
  // Server fns get unscoped, synchronous tables; `me` is the logged-in user without password.
  const db = Object.fromEntries(Object.entries(tables).map(([n, t]) => [n, {
    list: () => t.rows.map(t.out),
    get: (id) => { try { return t.get(id, null); } catch { return null; } },
    create: (obj) => t.create(obj, null),
    update: (id, changes) => t.update(id, changes, null),
    remove: (id) => t.remove(id, null),
  }]));
  const fail = (message, status = 400) => { throw new HttpError(status, "FAILED", String(message)); };

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      const me = currentUser(req);
      const publicMe = me && users.out(me);
      const body = req.method === "POST" || req.method === "PATCH" || req.method === "PUT" ? await readJson(req) : undefined;

      // ---------- auth ----------
      const a = /^\/api\/_auth\/(signup|login|logout|me)$/.exec(url.pathname);
      if (a) {
        if (!users) throw new HttpError(404, "NOT_FOUND", "auth is not enabled");
        if (a[1] === "me") return send(res, 200, publicMe), true;
        if (a[1] === "logout") {
          delete sessions[cookieOf(req)];
          saveSessions();
          return send(res, 204, undefined, { "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }), true;
        }
        if (a[1] === "signup") {
          const user = users.create(body, null);
          return send(res, 201, user, startSession(res, user)), true;
        }
        const user = users.rows.find((r) => r.email === body.email);
        if (!user || !checkPassword(body.password, user.password)) throw new HttpError(401, "LOGIN_FAILED", "wrong email or password");
        return send(res, 200, users.out(user), startSession(res, user)), true;
      }

      // ---------- server functions ----------
      const f = /^\/api\/_fn\/([\w$]+)$/.exec(url.pathname);
      if (f) {
        if (!Object.hasOwn(fns, f[1]) || req.method !== "POST") throw new HttpError(404, "NOT_FOUND", `no server fn named '${f[1]}'`);
        const result = await fns[f[1]]({ db, me: publicMe, fail }, ...(Array.isArray(body.args) ? body.args : []));
        return send(res, 200, result ?? null), true;
      }

      // ---------- REST ----------
      const m = /^\/api\/([\w-]+)(?:\/([^/]+))?\/?$/.exec(url.pathname);
      const t = m && tables[m[1]];
      if (!t) throw new HttpError(404, "NOT_FOUND", `no api named '${m?.[1] ?? url.pathname}'`);
      // The accounts api always needs a session, and each user can only change or delete themselves.
      if ((t.access !== "public" || t.isAuth) && !me) throw new HttpError(401, "LOGIN_REQUIRED", `log in to use /api/${t.name}`);
      const id = m[2] === undefined ? null : decodeURIComponent(m[2]);
      if (t.isAuth && req.method !== "GET") {
        if (id === null) throw new HttpError(403, "FORBIDDEN", "create accounts with auth.signup");
        if (String(me[t.key]) !== id) throw new HttpError(403, "FORBIDDEN", "you can only change your own account");
      }
      const isObj = body === undefined || (typeof body === "object" && body !== null && !Array.isArray(body));
      if (!isObj) throw new HttpError(400, "VALIDATION", `invalid body: expected ${t.model}`, { field: "(body)", expected: t.model, actual: typeof body });
      if (req.method === "GET") return send(res, 200, id === null ? t.list(me) : t.get(id, me)), true;
      if (req.method === "POST" && id === null) return send(res, 201, t.create(body, me)), true;
      if ((req.method === "PATCH" || req.method === "PUT") && id !== null) return send(res, 200, t.update(id, body, me, req.method === "PUT")), true;
      if (req.method === "DELETE" && id !== null) return send(res, 204, t.remove(id, me) ?? undefined), true;
      throw new HttpError(405, "METHOD_NOT_ALLOWED", `${req.method} not allowed here`);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, e.body), true;
      console.error(e);
      return send(res, 500, { error: "SERVER_ERROR", message: String(e?.message ?? e) }), true;
    }
  };
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const PRIVATE = new Set(["server.js", "server-runtime.js"]);

// Production server: the apis plus the built static files. Data lives in ART_DATA_DIR (default ./data).
export function serve(schema, fns, rootUrl, port = Number(process.env.PORT ?? 3000)) {
  const root = resolve(fileURLToPath(rootUrl));
  const dataDir = resolve(process.env.ART_DATA_DIR ?? join(root, "data"));
  const api = createApi(schema, dataDir, fns);
  const server = createServer(async (req, res) => {
    if (await api(req, res)) return;
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    let file = resolve(root, "." + path);
    const blocked = (!file.startsWith(root + sep) && file !== root) || file.startsWith(dataDir + sep) || PRIVATE.has(basename(file));
    // Unknown paths fall back to index.html (client-side routing).
    if (blocked || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  server.listen(port, () => console.log(`ArtScript server → http://localhost:${port}`));
  return server;
}
