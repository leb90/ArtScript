// ArtScript server runtime: REST apis generated from models (validation, SQLite storage, queries),
// email + password auth with cookie sessions and roles, per-user private data and server functions.
// Node only, no dependencies. `art dev` mounts createApi in its dev server; `art build` emits a
// server.js that calls serve().
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

// ---------- storage (SQLite, built into Node) ----------
// One table per api: id, owner (private apis) and the row as JSON. Rows keep insertion order.
// Older JSON-file data (<api>.json) is imported once on first start.
function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "art.db"));
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS _sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL)");
  const legacy = join(dataDir, "_sessions.json");
  if (existsSync(legacy)) {
    for (const [token, user] of Object.entries(JSON.parse(readFileSync(legacy, "utf8")))) db.prepare("INSERT OR IGNORE INTO _sessions VALUES (?, ?)").run(token, user);
    renameSync(legacy, legacy + ".imported");
  }
  return db;
}

const MAX_LIMIT = 1000;
// Passed as `me` by trusted server code (server fns, sessions): no per-user scoping.
const ALL = Symbol("all");
// SQLite has no booleans: JSON true/false come back from json_extract as 1/0.
const sqlValue = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v);

// A table: validated CRUD and queries over one api's rows. `me` scopes private apis to their owner.
function makeTable(schema, db, dataDir, name, { model, access }) {
  const fields = schema.models[model] ?? {};
  const key = idField(fields);
  const isAuth = schema.auth === name;
  const userKey = schema.auth ? idField(schema.models[schema.apis[schema.auth].model]) : null;
  const T = `"api_${name}"`;
  db.exec(`CREATE TABLE IF NOT EXISTS ${T} (id TEXT PRIMARY KEY, owner TEXT, data TEXT NOT NULL)`);
  const legacy = join(dataDir, `${name}.json`);
  if (existsSync(legacy)) {
    for (const row of JSON.parse(readFileSync(legacy, "utf8"))) db.prepare(`INSERT OR IGNORE INTO ${T} VALUES (?, ?, ?)`).run(String(row[key]), row.owner ?? null, JSON.stringify(row));
    renameSync(legacy, legacy + ".imported");
  }
  const parse = (r) => (r ? JSON.parse(r.data) : null);
  // Relations (`author: User`): stored as the referenced row's id, returned as that row (one level).
  const refs = schema.refs?.[model] ?? {};
  let tables = {};
  // Validation sees a relation as its id.
  const vschema = Object.keys(refs).length
    ? { ...schema, models: { ...schema.models, [model]: Object.fromEntries(Object.entries(fields).map(([f, t]) => [f, refs[f] ? t.replace(/^\w+/, "ID") : t])) } }
    : schema;
  const peek = (id) => parse(db.prepare(`SELECT data FROM ${T} WHERE id = ?`).get(String(id)));
  // Auth passwords never leave the server.
  const out = (row, deep = true) => {
    if (!row) return row ?? null;
    let r = row;
    if (isAuth) { const { password, ...rest } = r; r = rest; }
    if (deep) {
      for (const [f, { api, list }] of Object.entries(refs)) {
        const t = tables[api];
        if (!t || r[f] === null || r[f] === undefined) continue;
        const one = (id) => t.out(t.peek(id), false);
        r = { ...r, [f]: list ? r[f].map(one).filter(Boolean) : one(r[f]) };
      }
    }
    return r;
  };
  const scope = (me) => (access === "private" && me !== ALL ? { sql: "owner = ?", args: [me ? String(me[userKey]) : "\0none"] } : null);

  // { where, search, sort, limit, offset } → SQL. Field names are checked against the model.
  const field = (f) => {
    if (!(f in fields)) throw new HttpError(400, "BAD_QUERY", `${model} has no field '${f}'`, { field: f, expected: Object.keys(fields).join("|") });
    return `json_extract(data, '$.${f}')`;
  };
  function query(q = {}, me) {
    if (typeof q !== "object" || q === null) throw new HttpError(400, "BAD_QUERY", "the query must be an object");
    const conds = [], args = [];
    const s = scope(me);
    if (s) { conds.push(s.sql); args.push(...s.args); }
    for (const [f, v] of Object.entries(q.where ?? {})) {
      if (v === null) conds.push(`${field(f)} IS NULL`);
      else { conds.push(`${field(f)} = ?`); args.push(sqlValue(v)); }
    }
    if (q.search) {
      const text = Object.keys(fields).filter((f) => /^(String|Email)\??$/.test(fields[f]) && !(isAuth && f === "password"));
      if (text.length) {
        conds.push(`(${text.map((f) => `${field(f)} LIKE ?`).join(" OR ")})`);
        args.push(...text.map(() => `%${String(q.search).replace(/[%_]/g, "\\$&")}%`));
      }
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    let order = "ORDER BY rowid";
    if (q.sort) {
      const desc = String(q.sort).startsWith("-");
      order = `ORDER BY ${field(String(q.sort).replace(/^-/, ""))} ${desc ? "DESC" : "ASC"}, rowid`;
    }
    const limit = Math.min(Math.max(Number(q.limit ?? MAX_LIMIT) | 0, 0), MAX_LIMIT);
    const offset = Math.max(Number(q.offset ?? 0) | 0, 0);
    return { where, order, limit, offset, args };
  }

  const find = (id, me) => {
    const s = scope(me);
    const r = db.prepare(`SELECT data FROM ${T} WHERE id = ?${s ? ` AND ${s.sql}` : ""}`).get(String(id), ...(s?.args ?? []));
    if (!r) throw new HttpError(404, "NOT_FOUND", `${name}/${id} does not exist`);
    return parse(r);
  };
  const byEmail = (email) => parse(db.prepare(`SELECT data FROM ${T} WHERE json_extract(data, '$.email') = ?`).get(email));
  const check = (row, me) => {
    // A relation takes the referenced row or its id, and the row must exist (and be visible).
    for (const [f, { api, list }] of Object.entries(refs)) {
      const t = tables[api];
      const v = row[f];
      if (!t || v === null || v === undefined) continue;
      const idOf = (x) => (x && typeof x === "object" ? x[t.key] : x);
      row[f] = list && Array.isArray(v) ? v.map(idOf) : list ? v : idOf(v);
      for (const id of list ? (Array.isArray(row[f]) ? row[f] : []) : [row[f]]) {
        if (typeof id !== "string") continue; // reported by validate below
        try { t.find(id, me ?? ALL); } catch {
          throw new HttpError(400, "VALIDATION", `invalid ${f}: ${api}/${id} does not exist`, { field: f, expected: `an id of ${api}`, actual: JSON.stringify(id) });
        }
      }
    }
    const e = validate(vschema, model, row);
    if (e) throw new HttpError(400, "VALIDATION", `invalid ${e.field}: expected ${e.expected}, got ${e.actual}`, e);
    // Field rules: min/max (length of text or lists, value of numbers), match, unique.
    for (const [f, r] of Object.entries(schema.rules?.[model] ?? {})) {
      const v = row[f];
      if (v === null || v === undefined) continue;
      const size = typeof v === "number" ? v : v.length;
      const unit = typeof v === "number" ? "" : Array.isArray(v) ? " items" : " characters";
      const bad = (expected, actual) => { throw new HttpError(400, "VALIDATION", `invalid ${f}: expected ${expected}, got ${actual}`, { field: f, expected, actual }); };
      if (r.min !== undefined && size < r.min) bad(`at least ${r.min}${unit}`, `${size}${unit}`);
      if (r.max !== undefined && size > r.max) bad(`at most ${r.max}${unit}`, `${size}${unit}`);
      if (r.match !== undefined && !new RegExp(r.match).test(v)) bad(`text matching /${r.match}/`, JSON.stringify(v));
      if (r.unique) {
        const other = parse(db.prepare(`SELECT data FROM ${T} WHERE json_extract(data, '$.${f}') = ?`).get(sqlValue(v)));
        if (other && other[key] !== row[key]) throw new HttpError(409, "CONFLICT", `${f} ${JSON.stringify(v)} is already used`, { field: f });
      }
    }
    if (isAuth && !isHashed(row.password)) {
      if (row.password.length < MIN_PASSWORD) throw new HttpError(400, "VALIDATION", `invalid password: expected at least ${MIN_PASSWORD} characters`, { field: "password", expected: `String (min ${MIN_PASSWORD})`, actual: `${row.password.length} characters` });
      row.password = hashPassword(row.password);
    }
    if (isAuth) {
      const other = byEmail(row.email);
      if (other && other[key] !== row[key]) throw new HttpError(409, "CONFLICT", `email '${row.email}' is already registered`);
    }
  };

  return {
    name, model, access, key, isAuth, out, byEmail, find,
    list(me, q) {
      const { where, order, limit, offset, args } = query(q, me);
      return db.prepare(`SELECT data FROM ${T} ${where} ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset).map((r) => out(parse(r)));
    },
    count(me, q) {
      const { where, args } = query({ where: q?.where, search: q?.search }, me);
      return db.prepare(`SELECT COUNT(*) AS n FROM ${T} ${where}`).get(...args).n;
    },
    get: (id, me) => out(find(id, me)),
    hasAdmin: () => !!db.prepare(`SELECT 1 FROM ${T} WHERE json_extract(data, '$.role') = 'admin' LIMIT 1`).get(),
    create(body, me) {
      const row = { ...body };
      if (key && (row[key] === undefined || row[key] === null)) row[key] = randomUUID();
      if (access === "private" && me && me !== ALL) row.owner = String(me[userKey]);
      check(row, me);
      if (db.prepare(`SELECT 1 FROM ${T} WHERE id = ?`).get(String(row[key]))) throw new HttpError(409, "CONFLICT", `${key} '${row[key]}' already exists`);
      db.prepare(`INSERT INTO ${T} VALUES (?, ?, ?)`).run(String(row[key]), row.owner ?? null, JSON.stringify(row));
      return out(row);
    },
    // The key and the owner never change; `replace` (PUT) drops omitted fields, update (PATCH) merges.
    update(id, changes, me, replace = false) {
      const prev = find(id, me);
      const fixed = { ...(key ? { [key]: prev[key] } : {}), ...(access === "private" ? { owner: prev.owner } : {}) };
      const row = { ...(replace ? {} : prev), ...changes, ...fixed };
      if (isAuth && changes.password === undefined) row.password = prev.password;
      check(row, me);
      db.prepare(`UPDATE ${T} SET data = ? WHERE id = ?`).run(JSON.stringify(row), String(prev[key]));
      return out(row);
    },
    // Rows that reference this one block the delete (409), unless their field is `cascade`:
    // then they are deleted too. All or nothing.
    remove(id, me) {
      const prev = find(id, me);
      db.exec("SAVEPOINT art_remove");
      try {
        for (const t of Object.values(tables)) {
          for (const [f, r] of Object.entries(t.refs)) {
            if (r.api !== name) continue;
            const users = t.referencing(f, r.list, prev[key]);
            if (!users.length) continue;
            if (!schema.rules?.[t.model]?.[f]?.cascade) {
              throw new HttpError(409, "CONFLICT", `${name}/${prev[key]} is used by ${users.length} row(s) of ${t.name} (${f}); remove them first or mark ${t.model}.${f} \`cascade\``, { field: f, api: t.name });
            }
            for (const other of users) t.remove(other, ALL);
          }
        }
        db.prepare(`DELETE FROM ${T} WHERE id = ?`).run(String(prev[key]));
        db.exec("RELEASE art_remove");
      } catch (e) {
        db.exec("ROLLBACK TO art_remove");
        db.exec("RELEASE art_remove");
        throw e;
      }
      return null;
    },
    refs, peek,
    link: (all) => { tables = all; },
    referencing: (f, list, id) => db.prepare(list
      ? `SELECT id FROM ${T} WHERE EXISTS (SELECT 1 FROM json_each(data, '$.${f}') WHERE value = ?)`
      : `SELECT id FROM ${T} WHERE json_extract(data, '$.${f}') = ?`).all(String(id)).map((r) => r.id),
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
  const sql = openDb(dataDir);
  const tables = Object.fromEntries(Object.entries(schema.apis).map(([n, a]) => [n, makeTable(schema, sql, dataDir, n, a)]));
  for (const t of Object.values(tables)) t.link(tables);
  const users = schema.auth ? tables[schema.auth] : null;
  const hasRoles = !!users && "role" in (schema.models[users.model] ?? {});
  const isAdmin = (me) => hasRoles && me?.role === "admin";

  const currentUser = (req) => {
    const token = cookieOf(req);
    const row = token && sql.prepare("SELECT user FROM _sessions WHERE token = ?").get(token);
    if (!row || !users) return null;
    try { return users.find(row.user, ALL); } catch { return null; }
  };
  const startSession = (user) => {
    const token = randomBytes(24).toString("hex");
    sql.prepare("INSERT INTO _sessions VALUES (?, ?)").run(token, String(user[users.key]));
    return { "set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` };
  };
  // Server fns get unscoped, synchronous tables; `me` is the logged-in user without password.
  const db = Object.fromEntries(Object.entries(tables).map(([n, t]) => [n, {
    list: (q) => t.list(ALL, q),
    count: (q) => t.count(ALL, q),
    get: (id) => { try { return t.get(id, ALL); } catch { return null; } },
    create: (obj) => t.create(obj, ALL),
    update: (id, changes) => t.update(id, changes, ALL),
    remove: (id) => t.remove(id, ALL),
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
          sql.prepare("DELETE FROM _sessions WHERE token = ?").run(cookieOf(req) ?? "");
          return send(res, 204, undefined, { "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }), true;
        }
        if (a[1] === "signup") {
          // Nobody picks their own role: the first account is the admin, the rest are users.
          const fields = hasRoles ? { ...body, role: users.hasAdmin() ? "user" : "admin" } : body;
          const user = users.create(fields, ALL);
          return send(res, 201, user, startSession(user)), true;
        }
        const user = users.byEmail(body.email);
        if (!user || !checkPassword(body.password, user.password)) throw new HttpError(401, "LOGIN_FAILED", "wrong email or password");
        return send(res, 200, users.out(user), startSession(user)), true;
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
      const write = req.method !== "GET";
      // `login`/`private` apis and the accounts api need a session; `admin` apis need one to write.
      if ((t.access === "login" || t.access === "private" || t.isAuth || (t.access === "admin" && write)) && !me) {
        throw new HttpError(401, "LOGIN_REQUIRED", `log in to use /api/${t.name}`);
      }
      if (t.access === "admin" && write && !isAdmin(me)) throw new HttpError(403, "FORBIDDEN", `only admins can change /api/${t.name}`);
      const id = m[2] === undefined ? null : decodeURIComponent(m[2]);
      // Accounts: create them with auth.signup; each user changes only themselves (admins: anyone),
      // and only admins change roles.
      if (t.isAuth && write) {
        if (id === null) throw new HttpError(403, "FORBIDDEN", "create accounts with auth.signup");
        if (String(me[t.key]) !== id && !isAdmin(me)) throw new HttpError(403, "FORBIDDEN", "you can only change your own account");
        if (hasRoles && body && "role" in body && !isAdmin(me)) throw new HttpError(403, "FORBIDDEN", "only admins can change roles");
      }
      const isObj = body === undefined || (typeof body === "object" && body !== null && !Array.isArray(body));
      if (!isObj) throw new HttpError(400, "VALIDATION", `invalid body: expected ${t.model}`, { field: "(body)", expected: t.model, actual: typeof body });
      if (req.method === "GET") {
        let q;
        try { q = url.searchParams.has("q") ? JSON.parse(url.searchParams.get("q")) : {}; } catch { throw new HttpError(400, "BAD_QUERY", "q must be JSON"); }
        if (id === "_count") return send(res, 200, t.count(me, q)), true;
        return send(res, 200, id === null ? t.list(me, q) : t.get(id, me)), true;
      }
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
