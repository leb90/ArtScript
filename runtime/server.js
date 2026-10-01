// ArtScript server runtime: REST apis generated from models (validation, SQLite storage, queries),
// email + password auth with cookie sessions and roles, per-user private data and server functions.
// Node only, no dependencies. `art dev` mounts createApi in its dev server; `art build` emits a
// server.js that calls serve().
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE = "art_session";
const MIN_PASSWORD = 8;
const SESSION_DAYS = 30;
// Largest JSON body accepted (bytes).
const MAX_JSON = Number(process.env.ART_MAX_JSON ?? 1024 * 1024);
// Failed logins allowed per email and address in LOGIN_WINDOW before answering 429.
const LOGIN_TRIES = 10;
const LOGIN_WINDOW = 15 * 60_000;
// Largest upload accepted (bytes); a `File` field's `max=` can only lower it.
const MAX_UPLOAD = Number(process.env.ART_MAX_UPLOAD ?? 10 * 1024 * 1024);
// Uploaded files shown inline; anything else is downloaded (an uploaded page can't run here).
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|video\/|audio\/|application\/pdf$|text\/plain$)/;

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
    case "File": return kind === "object" && typeof value.url === "string" ? null : fail("File (upload it first: a File value in create/update)", kind);
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
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS _sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, expires INTEGER)");
  // Databases from before sessions expired get the column; their sessions expire like new ones.
  if (!db.prepare("PRAGMA table_info(_sessions)").all().some((c) => c.name === "expires")) {
    db.exec(`ALTER TABLE _sessions ADD COLUMN expires INTEGER; UPDATE _sessions SET expires = ${Date.now() + SESSION_DAYS * 86_400_000}`);
  }
  db.exec("CREATE TABLE IF NOT EXISTS _files (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL)");
  // One-time tokens for password resets and email verification (only their hash is stored).
  db.exec("CREATE TABLE IF NOT EXISTS _tokens (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user TEXT NOT NULL, expires INTEGER NOT NULL)");
  const legacy = join(dataDir, "_sessions.json");
  if (existsSync(legacy)) {
    for (const [token, user] of Object.entries(JSON.parse(readFileSync(legacy, "utf8")))) db.prepare("INSERT OR IGNORE INTO _sessions VALUES (?, ?, ?)").run(token, user, Date.now() + SESSION_DAYS * 86_400_000);
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
// Brings the stored rows of an api in line with its model when the model changed since the last
// start: renamed fields (`was="old"`) move, removed fields are dropped, added fields get their
// default (an optional one stays null). A copy of the database is saved before the first change.
// A new required field without a default stops the server with the fix.
function migrate(db, name, model, schema, defaults, backup) {
  const T = `"api_${name}"`;
  db.exec("CREATE TABLE IF NOT EXISTS _schema (api TEXT PRIMARY KEY, fields TEXT NOT NULL)");
  const fields = schema.models[model] ?? {};
  const current = JSON.stringify(fields);
  const stored = db.prepare("SELECT fields FROM _schema WHERE api = ?").get(name)?.fields;
  if (stored === current) return;
  const before = stored ? JSON.parse(stored) : null;
  const renames = Object.entries(schema.rules?.[model] ?? {}).filter(([, r]) => r.was).map(([f, r]) => [r.was, f]);
  const rows = db.prepare(`SELECT id, data FROM ${T}`).all();
  const changed = [];
  const missing = new Set();
  for (const { id, data } of rows) {
    const row = JSON.parse(data);
    const next = { ...row };
    for (const [from, to] of renames) if (from in next && !(to in next)) { next[to] = next[from]; delete next[from]; }
    for (const k of Object.keys(next)) if (!(k in fields) && k !== "owner" && (before === null || k in before || renames.some(([f]) => f === k))) delete next[k];
    for (const [f, t] of Object.entries(fields)) {
      if (next[f] !== undefined) continue;
      if (f in defaults) next[f] = structuredClone(defaults[f]);
      else if (t.endsWith("?")) continue;
      else if (t.endsWith("[]")) next[f] = [];
      else missing.add(f);
    }
    if (JSON.stringify(next) !== data) changed.push([id, next]);
  }
  if (missing.size) {
    const f = [...missing][0];
    throw new Error(`ArtScript: ${name} has rows without '${f}', a new required field of ${model}. Give it a default (\`${f}: ${fields[f]} = ...\`) or make it optional (\`${f}: ${fields[f]}?\`).`);
  }
  if (changed.length) {
    backup();
    const update = db.prepare(`UPDATE ${T} SET data = ? WHERE id = ?`);
    db.exec("BEGIN");
    for (const [id, row] of changed) update.run(JSON.stringify(row), id);
    db.exec("COMMIT");
  }
  db.prepare("INSERT OR REPLACE INTO _schema VALUES (?, ?)").run(name, current);
}

function makeTable(schema, db, dataDir, name, { model, access }, backup) {
  const fields = schema.models[model] ?? {};
  const key = idField(fields);
  const isAuth = schema.auth === name;
  const userKey = schema.auth ? idField(schema.models[schema.apis[schema.auth].model]) : null;
  const T = `"api_${name}"`;
  db.exec(`CREATE TABLE IF NOT EXISTS ${T} (id TEXT PRIMARY KEY, owner TEXT, data TEXT NOT NULL)`);
  const defaults = schema.defaults?.[model] ?? {};
  migrate(db, name, model, schema, defaults, backup);
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
  let changedHook = () => {};
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
    // `File` fields: the descriptor must point to an uploaded file; its name, type and size come
    // from the server's record (not from the client), and `max` (bytes) and `accept` apply to them.
    for (const [f, t] of Object.entries(fields)) {
      if (!/^File(\[\])?\??$/.test(t) || row[f] === null || row[f] === undefined) continue;
      const r = schema.rules?.[model]?.[f] ?? {};
      const one = (v) => {
        const id = typeof v?.url === "string" ? /^\/api\/_files\/([\w-]+)$/.exec(v.url)?.[1] : null;
        const meta = id && db.prepare("SELECT id, name, type, size FROM _files WHERE id = ?").get(id);
        if (!meta) throw new HttpError(400, "VALIDATION", `invalid ${f}: expected an uploaded file`, { field: f, expected: "File", actual: JSON.stringify(v) });
        if (r.max !== undefined && meta.size > r.max) throw new HttpError(400, "VALIDATION", `invalid ${f}: expected at most ${r.max} bytes, got ${meta.size}`, { field: f, expected: `at most ${r.max} bytes`, actual: `${meta.size} bytes` });
        if (r.accept !== undefined && !accepts(r.accept, meta)) throw new HttpError(400, "VALIDATION", `invalid ${f}: expected ${r.accept}, got ${meta.type}`, { field: f, expected: r.accept, actual: meta.type });
        return { url: `/api/_files/${meta.id}`, name: meta.name, type: meta.type, size: meta.size };
      };
      row[f] = t.startsWith("File[]") ? (Array.isArray(row[f]) ? row[f].map(one) : row[f]) : one(row[f]);
    }
    const e = validate(vschema, model, row);
    if (e) throw new HttpError(400, "VALIDATION", `invalid ${e.field}: expected ${e.expected}, got ${e.actual}`, e);
    // Field rules: min/max (length of text or lists, value of numbers), match, unique.
    for (const [f, r] of Object.entries(schema.rules?.[model] ?? {})) {
      const v = row[f];
      if (v === null || v === undefined || /^File/.test(fields[f])) continue;
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
      for (const [f, v] of Object.entries(defaults)) if (row[f] === undefined) row[f] = structuredClone(v);
      if (key && (row[key] === undefined || row[key] === null)) row[key] = randomUUID();
      if (access === "private" && me && me !== ALL) row.owner = String(me[userKey]);
      check(row, me);
      if (db.prepare(`SELECT 1 FROM ${T} WHERE id = ?`).get(String(row[key]))) throw new HttpError(409, "CONFLICT", `${key} '${row[key]}' already exists`);
      db.prepare(`INSERT INTO ${T} VALUES (?, ?, ?)`).run(String(row[key]), row.owner ?? null, JSON.stringify(row));
      changedHook(name);
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
      changedHook(name);
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
        changedHook(name);
      } catch (e) {
        db.exec("ROLLBACK TO art_remove");
        db.exec("RELEASE art_remove");
        throw e;
      }
      return null;
    },
    refs, peek,
    link: (all, onChange) => { tables = all; changedHook = onChange; },
    referencing: (f, list, id) => db.prepare(list
      ? `SELECT id FROM ${T} WHERE EXISTS (SELECT 1 FROM json_each(data, '$.${f}') WHERE value = ?)`
      : `SELECT id FROM ${T} WHERE json_extract(data, '$.${f}') = ?`).all(String(id)).map((r) => r.id),
  };
}

// Sends an email: through Resend (ART_RESEND_KEY, from ART_EMAIL_FROM), through any service that
// takes a JSON POST (ART_EMAIL_WEBHOOK: { to, subject, text }), or, with neither, written to the
// console and to <data>/outbox.jsonl (development).
export async function sendEmail(dataDir, { to, subject, text }) {
  const env = process.env;
  if (env.ART_RESEND_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.ART_RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.ART_EMAIL_FROM ?? "onboarding@resend.dev", to, subject, text }),
    });
    if (!res.ok) throw new Error(`email not sent (${res.status})`);
    return;
  }
  if (env.ART_EMAIL_WEBHOOK) {
    const res = await fetch(env.ART_EMAIL_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, subject, text }) });
    if (!res.ok) throw new Error(`email not sent (${res.status})`);
    return;
  }
  mkdirSync(dataDir, { recursive: true });
  appendFileSync(join(dataDir, "outbox.jsonl"), JSON.stringify({ t: new Date().toISOString(), to, subject, text }) + "\n");
  console.log(`[email to ${to}] ${subject}\n${text}\n`);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// OAuth providers (`auth users with google, github`). Credentials: ART_<P>_ID and ART_<P>_SECRET;
// ART_<P>_AUTHORIZE / _TOKEN / _USER replace the endpoints (a self-hosted provider, or tests).
const PROVIDERS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    user: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid email profile",
    profile: (u) => (u.email && u.email_verified !== false ? { email: u.email, name: u.name ?? "" } : null),
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token",
    user: "https://api.github.com/user", scope: "read:user user:email",
    profile: (u) => (u.email ? { email: u.email, name: u.name ?? u.login ?? "" } : null),
  },
};
const providerConf = (name) => {
  const P = name.toUpperCase(), env = process.env, base = PROVIDERS[name];
  return { ...base, id: env[`ART_${P}_ID`], secret: env[`ART_${P}_SECRET`], authorize: env[`ART_${P}_AUTHORIZE`] ?? base.authorize, token: env[`ART_${P}_TOKEN`] ?? base.token, user: env[`ART_${P}_USER`] ?? base.user };
};

// `accept="image/*,.pdf"`: MIME types (with `type/*`) or extensions, like <input accept>.
function accepts(accept, { name, type }) {
  return accept.split(",").map((a) => a.trim().toLowerCase()).some((a) =>
    a.startsWith(".") ? name.toLowerCase().endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a);
}

// POST /api/_files (the raw body, `content-type` and `x-file-name` headers) → { url, name, type, size };
// GET /api/_files/<id> → the file.
async function files(req, res, id, sql, dataDir) {
  const dir = join(dataDir, "files");
  if (req.method === "POST" && !id) {
    const tooLarge = () => { req.resume(); return new HttpError(413, "TOO_LARGE", `the file is larger than ${MAX_UPLOAD} bytes`); };
    if (Number(req.headers["content-length"] ?? 0) > MAX_UPLOAD) throw tooLarge();
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_UPLOAD) throw tooLarge();
      chunks.push(chunk);
    }
    const meta = {
      id: randomUUID(),
      name: decodeURIComponent(String(req.headers["x-file-name"] ?? "file")).replace(/[\\/]/g, "_").slice(0, 200) || "file",
      type: String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0].trim().toLowerCase(),
      size,
    };
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, meta.id), Buffer.concat(chunks));
    sql.prepare("INSERT INTO _files VALUES (?, ?, ?, ?)").run(meta.id, meta.name, meta.type, meta.size);
    return send(res, 201, { url: `/api/_files/${meta.id}`, name: meta.name, type: meta.type, size: meta.size });
  }
  const meta = req.method === "GET" && id && sql.prepare("SELECT * FROM _files WHERE id = ?").get(id);
  if (!meta) throw new HttpError(404, "NOT_FOUND", "no such file");
  res.writeHead(200, {
    "content-type": meta.type,
    "content-length": meta.size,
    "content-disposition": `${INLINE.test(meta.type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "public, max-age=31536000, immutable",
  });
  createReadStream(join(dir, meta.id)).pipe(res);
}

function send(res, status, body, headers = {}) {
  if (body === undefined) return res.writeHead(status, headers).end();
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

async function readJson(req) {
  // Too large: the rest is discarded (unread, the client would see a reset instead of the 413).
  const tooLarge = () => { req.resume(); return new HttpError(413, "TOO_LARGE", `the request body is larger than ${MAX_JSON} bytes`); };
  if (Number(req.headers["content-length"] ?? 0) > MAX_JSON) throw tooLarge();
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_JSON) throw tooLarge();
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "BAD_JSON", "invalid JSON body"); }
}

const cookieOf = (req) => Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter((p) => p.length === 2))[COOKIE];

// Returns an async (req, res) => boolean handler; true when the request was an /api/ call.
// `fns`: the compiled server functions ({ name: async ({ db, me, fail }, ...args) => any }).
// `jobs`: scheduled `server job`s ({ name: { every: ms, run } }); `handler.stop()` cancels them.
export function createApi(schema, dataDir, fns = {}, jobs = {}) {
  const sql = openDb(dataDir);
  let saved = false; // one backup per start, before the first migration
  const backup = () => {
    if (saved) return;
    saved = true;
    sql.exec(`VACUUM INTO '${join(dataDir, `art-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.db`).replace(/'/g, "''")}'`);
  };
  const tables = Object.fromEntries(Object.entries(schema.apis).map(([n, a]) => [n, makeTable(schema, sql, dataDir, n, a, backup)]));
  // Live clients (`data ... live`) get the name of each api that changes; never the data.
  const streams = new Set();
  const changed = (name) => { for (const res of streams) res.write(`data: ${name}\n\n`); };
  for (const t of Object.values(tables)) t.link(tables, changed);
  const users = schema.auth ? tables[schema.auth] : null;
  const hasRoles = !!users && "role" in (schema.models[users.model] ?? {});
  const isAdmin = (me) => hasRoles && me?.role === "admin";

  // Sessions expire after SESSION_DAYS on the server too (not only the cookie).
  const currentUser = (req) => {
    const token = cookieOf(req);
    const row = token && sql.prepare("SELECT user, expires FROM _sessions WHERE token = ?").get(token);
    if (!row || !users) return null;
    if (row.expires !== null && row.expires < Date.now()) {
      sql.prepare("DELETE FROM _sessions WHERE token = ?").run(token);
      return null;
    }
    try { return users.find(row.user, ALL); } catch { return null; }
  };
  const startSession = (user) => {
    const token = randomBytes(24).toString("hex");
    sql.prepare("INSERT INTO _sessions VALUES (?, ?, ?)").run(token, String(user[users.key]), Date.now() + SESSION_DAYS * 86_400_000);
    return { "set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86_400}` };
  };
  // Server fns get unscoped, synchronous tables; `me` is the logged-in user without password.
  const email = (to, subject, text) => sendEmail(dataDir, { to, subject, text });
  const db = Object.fromEntries(Object.entries(tables).map(([n, t]) => [n, {
    list: (q) => t.list(ALL, q),
    count: (q) => t.count(ALL, q),
    get: (id) => { try { return t.get(id, ALL); } catch { return null; } },
    create: (obj) => t.create(obj, ALL),
    update: (id, changes) => t.update(id, changes, ALL),
    remove: (id) => t.remove(id, ALL),
  }]));
  const fail = (message, status = 400) => { throw new HttpError(status, "FAILED", String(message)); };
  const failedLogins = new Map(); // "email|address" → times of failed attempts (also reset requests)
  // Email verification is on when the accounts model has `verified: Bool`.
  const verifies = !!users && schema.models[users.model]?.verified === "Bool";
  // Emails a one-time link (`<origin><path>?token=...`, valid 1 hour) to the user.
  const mailToken = async (req, user, kind, subject, path, action) => {
    const token = randomBytes(32).toString("hex");
    sql.prepare("INSERT INTO _tokens VALUES (?, ?, ?, ?)").run(sha256(token), kind, String(user[users.key]), Date.now() + 3_600_000);
    const origin = req.headers.origin ?? `${req.headers["x-forwarded-proto"] ?? "http"}://${req.headers.host}`;
    await sendEmail(dataDir, { to: user.email, subject, text: `${action}: ${origin}${path}?token=${token}\n\nThe link works for one hour. If you didn't ask for it, ignore this email.` });
  };

  // A job never overlaps itself; a failure is logged and the next run happens as scheduled.
  const timers = Object.entries(jobs).map(([name, job]) => {
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try { await job.run({ db, fail, email }); } catch (e) { console.error(`server job ${name}:`, e?.message ?? e); } finally { running = false; }
    }, job.every);
    timer.unref?.();
    return timer;
  });

  const handler = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      if (url.pathname === "/api/_events" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(": live\n\n");
        streams.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 25000);
        ping.unref?.(); // an open stream doesn't keep the process alive
        req.on("close", () => { clearInterval(ping); streams.delete(res); });
        return true;
      }
      if (url.pathname === "/api/_health") return send(res, 200, { ok: true }), true;
      // CSRF: a cross-site page can't send these without a CORS preflight (which this server never
      // answers): writes must be JSON, uploads must carry x-file-name.
      const fm = /^\/api\/_files(?:\/([\w-]+))?$/.exec(url.pathname);
      const writes = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"; // a cross-site DELETE needs a preflight anyway
      if (writes && (fm ? req.headers["x-file-name"] === undefined : !String(req.headers["content-type"] ?? "").startsWith("application/json"))) {
        throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", fm ? "uploads need an x-file-name header" : "send JSON (content-type: application/json)");
      }
      if (fm) return await files(req, res, fm[1], sql, dataDir), true;
      const me = currentUser(req);
      const publicMe = me && users.out(me);
      const body = req.method === "POST" || req.method === "PATCH" || req.method === "PUT" ? await readJson(req) : undefined;

      // ---------- auth ----------
      // ---------- OAuth: /api/_auth/oauth/<provider> → the provider → .../callback → "/" signed in ----------
      const o = /^\/api\/_auth\/oauth\/(\w+)(\/callback)?$/.exec(url.pathname);
      if (o && req.method === "GET") {
        if (!users || !(schema.oauth ?? []).includes(o[1])) throw new HttpError(404, "NOT_FOUND", `sign-in with ${o[1]} is not enabled`);
        const p = providerConf(o[1]);
        if (!p.id || !p.secret) throw new HttpError(500, "OAUTH_CONFIG", `set ART_${o[1].toUpperCase()}_ID and ART_${o[1].toUpperCase()}_SECRET`);
        const origin = `${req.headers["x-forwarded-proto"] ?? "http"}://${req.headers.host}`;
        const redirect = `${origin}/api/_auth/oauth/${o[1]}/callback`;
        const stateCookie = "art_oauth";
        if (!o[2]) {
          const state = randomBytes(16).toString("hex");
          const to = new URL(p.authorize);
          for (const [k, v] of Object.entries({ client_id: p.id, redirect_uri: redirect, response_type: "code", scope: p.scope, state })) to.searchParams.set(k, v);
          res.writeHead(302, { location: to.href, "set-cookie": `${stateCookie}=${state}; HttpOnly; SameSite=Lax; Path=/api/_auth/oauth; Max-Age=600` }).end();
          return true;
        }
        // The state must match the cookie set when the flow started (CSRF).
        const sent = Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")))[stateCookie];
        if (!sent || sent !== url.searchParams.get("state")) throw new HttpError(400, "OAUTH_STATE", "the sign-in link expired; try again");
        const tok = await (await fetch(p.token, {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ client_id: p.id, client_secret: p.secret, code: url.searchParams.get("code") ?? "", redirect_uri: redirect, grant_type: "authorization_code" }),
        })).json();
        if (!tok.access_token) throw new HttpError(400, "OAUTH_FAILED", "the provider didn't sign you in");
        const auth = { authorization: `Bearer ${tok.access_token}`, accept: "application/json", "user-agent": "artscript" };
        const info = await (await fetch(p.user, { headers: auth })).json();
        // GitHub may hide the email in the profile: ask for the primary, verified one.
        if (o[1] === "github" && !info.email) {
          const emails = await (await fetch(new URL("/user/emails", p.user).href, { headers: auth })).json();
          info.email = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified)?.email : undefined;
        }
        const prof = p.profile(info);
        if (!prof) throw new HttpError(400, "OAUTH_FAILED", "the provider didn't share a verified email");
        let user = users.byEmail(prof.email);
        if (!user) {
          const m = schema.models[users.model];
          user = users.create({
            email: prof.email, password: randomBytes(24).toString("hex"),
            ...("name" in m && /^String/.test(m.name) ? { name: prof.name || prof.email.split("@")[0] } : {}),
            ...(hasRoles ? { role: users.hasAdmin() ? "user" : "admin" } : {}),
            ...(verifies ? { verified: true } : {}),
          }, ALL);
        } else if (verifies && !user.verified) users.update(user[users.key], { verified: true }, ALL);
        const session = startSession(user);
        res.writeHead(302, { location: "/", "set-cookie": [session["set-cookie"], `${stateCookie}=; Path=/api/_auth/oauth; Max-Age=0`] }).end();
        return true;
      }

      const a = /^\/api\/_auth\/(signup|login|logout|logout-all|me|reset-request|reset|verify)$/.exec(url.pathname);
      if (a) {
        if (!users) throw new HttpError(404, "NOT_FOUND", "auth is not enabled");
        if (a[1] === "me") return send(res, 200, publicMe), true;
        // Every session of this user, on every device.
        if (a[1] === "logout-all") {
          if (me) sql.prepare("DELETE FROM _sessions WHERE user = ?").run(String(me[users.key]));
          return send(res, 204, undefined, { "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }), true;
        }
        if (a[1] === "logout") {
          sql.prepare("DELETE FROM _sessions WHERE token = ?").run(cookieOf(req) ?? "");
          return send(res, 204, undefined, { "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }), true;
        }
        if (a[1] === "signup") {
          // Nobody picks their own role (the first account is the admin, the rest are users) and
          // nobody marks their own email as verified.
          const fields = { ...body, ...(hasRoles ? { role: users.hasAdmin() ? "user" : "admin" } : {}), ...(verifies ? { verified: false } : {}) };
          const user = users.create(fields, ALL);
          if (verifies) await mailToken(req, user, "verify", "Confirm your email", "/verify-email", "Confirm your email address");
          return send(res, 201, user, startSession(user)), true;
        }
        // Password reset: the same answer whether the account exists or not (no enumeration).
        if (a[1] === "reset-request") {
          const user = users.byEmail(String(body.email));
          const key = `reset|${String(body.email).toLowerCase()}`;
          const recent = (failedLogins.get(key) ?? []).filter((t) => Date.now() - t < 3_600_000);
          if (user && recent.length < 5) {
            failedLogins.set(key, [...recent, Date.now()]);
            await mailToken(req, user, "reset", "Reset your password", "/reset-password", "Set a new password");
          }
          return send(res, 204), true;
        }
        if (a[1] === "reset" || a[1] === "verify") {
          const kind = a[1] === "reset" ? "reset" : "verify";
          const row = sql.prepare("SELECT user, expires FROM _tokens WHERE hash = ? AND kind = ?").get(sha256(String(body.token ?? "")), kind);
          if (!row || row.expires < Date.now()) throw new HttpError(400, "BAD_TOKEN", "this link is invalid or has expired");
          sql.prepare("DELETE FROM _tokens WHERE hash = ?").run(sha256(String(body.token)));
          if (kind === "reset") {
            users.update(row.user, { password: String(body.password ?? "") }, ALL);
            sql.prepare("DELETE FROM _sessions WHERE user = ?").run(row.user); // every device signs in again
          } else users.update(row.user, { verified: true }, ALL);
          return send(res, 204), true;
        }
        const key = `${String(body.email).toLowerCase()}|${req.socket?.remoteAddress ?? ""}`;
        const now = Date.now();
        const tries = (failedLogins.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW);
        if (tries.length >= LOGIN_TRIES) throw new HttpError(429, "TOO_MANY_ATTEMPTS", "too many failed logins; try again in a few minutes");
        const user = users.byEmail(body.email);
        if (!user || !checkPassword(body.password, user.password)) {
          failedLogins.set(key, [...tries, now]);
          throw new HttpError(401, "LOGIN_FAILED", "wrong email or password");
        }
        failedLogins.delete(key);
        return send(res, 200, users.out(user), startSession(user)), true;
      }

      // ---------- server functions ----------
      const f = /^\/api\/_fn\/([\w$]+)$/.exec(url.pathname);
      if (f) {
        if (!Object.hasOwn(fns, f[1]) || req.method !== "POST") throw new HttpError(404, "NOT_FOUND", `no server fn named '${f[1]}'`);
        const result = await fns[f[1]]({ db, me: publicMe, fail, email }, ...(Array.isArray(body.args) ? body.args : []));
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
      if ((req.method === "PATCH" || req.method === "PUT") && id !== null) {
        const row = t.update(id, body, me, req.method === "PUT");
        // A new password signs out that user's other sessions.
        if (t.isAuth && body.password !== undefined) sql.prepare("DELETE FROM _sessions WHERE user = ? AND token != ?").run(String(row[t.key]), cookieOf(req) ?? "");
        return send(res, 200, row), true;
      }
      if (req.method === "DELETE" && id !== null) return send(res, 204, t.remove(id, me) ?? undefined), true;
      throw new HttpError(405, "METHOD_NOT_ALLOWED", `${req.method} not allowed here`);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, e.body), true;
      console.error(e);
      return send(res, 500, { error: "SERVER_ERROR", message: String(e?.message ?? e) }), true;
    }
  };
  handler.stop = () => timers.forEach(clearInterval);
  return handler;
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const PRIVATE = new Set(["server.js", "server-runtime.js"]);

// Production server: the apis plus the built static files. Data lives in ART_DATA_DIR (default ./data).
// Headers for pages and assets. ART_CSP=off disables the CSP, or replaces it with its value.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function securityHeaders(req) {
  const csp = process.env.ART_CSP === "off" ? null : process.env.ART_CSP ?? CSP;
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    ...(csp ? { "content-security-policy": csp } : {}),
    // Behind an HTTPS proxy, browsers keep using HTTPS.
    ...(req.headers["x-forwarded-proto"] === "https" ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

export function serve(schema, fns, rootUrl, port = Number(process.env.PORT ?? 3000), jobs = {}) {
  const root = resolve(fileURLToPath(rootUrl));
  const dataDir = resolve(process.env.ART_DATA_DIR ?? join(root, "data"));
  const api = createApi(schema, dataDir, fns, jobs);
  // ART_LOG=json: one JSON line per request (time, method, path, status, ms) for log collectors.
  const log = process.env.ART_LOG === "json";
  const server = createServer(async (req, res) => {
    if (log) {
      const t0 = performance.now();
      res.on("finish", () => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), method: req.method, path: req.url, status: res.statusCode, ms: Math.round(performance.now() - t0) }) + "\n"));
    }
    if (await api(req, res)) return;
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    let file = resolve(root, "." + path);
    const blocked = (!file.startsWith(root + sep) && file !== root) || file.startsWith(dataDir + sep) || PRIVATE.has(basename(file));
    // A prerendered route (`art build --prerender`) has its own index.html; other unknown paths
    // fall back to the app's index.html (client-side routing).
    if (!blocked && existsSync(file) && statSync(file).isDirectory() && existsSync(join(file, "index.html"))) file = join(file, "index.html");
    if (blocked || !existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(root, "_app.html")) ? join(root, "_app.html") : join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...securityHeaders(req) }).end(readFileSync(file));
  });
  server.listen(port, () => console.log(`ArtScript server → http://localhost:${port}`));
  return server;
}
