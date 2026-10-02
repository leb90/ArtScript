// ArtScript demo backend: the app's api, accounts and server fns running in the visitor's browser,
// for `art build --demo` (a full-stack app published as static files). It answers the same
// `/api/...` requests the server would, with the same rules (validation, access, relations), and
// keeps the data in localStorage: every visitor has their own. Not a server: nothing here is
// secret or shared, and passwords are only as safe as the visitor's own browser.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_LIMIT = 1000;
const ALL = Symbol("all"); // trusted code (server fns): no per-user scoping

class HttpError extends Error {
  constructor(status, error, message, extra = {}) {
    super(message);
    this.status = status;
    this.body = { error, message, ...extra };
  }
}

// The server's validation (runtime/server.js), kept in step with it by tests/demo.test.ts.
function validate(schema, type, value, path = "") {
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

const idField = (model) => Object.keys(model).find((k) => model[k] === "ID") ?? null;
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
// Not secret (the data lives in the visitor's own browser); it only keeps passwords out of plain sight.
const hashed = (p) => "demo$" + btoa(unescape(encodeURIComponent(p)));

// A table: the same validated CRUD and queries as the server's, over an array of rows.
function makeTable(schema, store, save, name, { model, access, readonly }) {
  const fields = schema.models[model] ?? {};
  const key = idField(fields);
  const isAuth = schema.auth === name;
  const userKey = schema.auth ? idField(schema.models[schema.apis[schema.auth].model]) : null;
  const defaults = schema.defaults?.[model] ?? {};
  const refs = schema.refs?.[model] ?? {};
  const rows = () => (store.tables[name] ??= []);
  let tables = {};
  const vschema = Object.keys(refs).length
    ? { ...schema, models: { ...schema.models, [model]: Object.fromEntries(Object.entries(fields).map(([f, t]) => [f, refs[f] ? t.replace(/^\w+/, "ID") : t])) } }
    : schema;
  const peek = (id) => rows().find((r) => String(r[key]) === String(id)) ?? null;
  const out = (row, deep = true, include = []) => {
    if (!row) return null;
    let r = { ...row };
    if (isAuth) delete r.password;
    if (deep) {
      for (const [f, { api, list }] of Object.entries(refs)) {
        const t = tables[api];
        if (!t || r[f] === null || r[f] === undefined) continue;
        const below = include.filter((p) => p.startsWith(f + ".")).map((p) => p.slice(f.length + 1));
        const one = (id) => t.out(t.peek(id), below.length > 0, below);
        r[f] = list ? r[f].map(one).filter(Boolean) : one(r[f]);
      }
    }
    return r;
  };
  const mine = (me) => (access === "private" && me !== ALL ? (r) => r.owner === (me ? String(me[userKey]) : "\0none") : () => true);
  const field = (f) => {
    if (!(f in fields)) throw new HttpError(400, "BAD_QUERY", `${model} has no field '${f}'`, { field: f, expected: Object.keys(fields).join("|") });
    return f;
  };
  function select(q = {}, me) {
    if (typeof q !== "object" || q === null) throw new HttpError(400, "BAD_QUERY", "the query must be an object");
    let found = rows().filter(mine(me));
    for (const [f, v] of Object.entries(q.where ?? {})) {
      field(f);
      found = found.filter((r) => (v === null ? r[f] === null || r[f] === undefined : r[f] === v));
    }
    if (q.search) {
      const text = Object.keys(fields).filter((f) => /^(String|Email)\??$/.test(fields[f]) && !(isAuth && f === "password"));
      const needle = String(q.search).toLowerCase();
      if (text.length) found = found.filter((r) => text.some((f) => typeof r[f] === "string" && r[f].toLowerCase().includes(needle)));
    }
    return found;
  }
  const find = (id, me) => {
    const r = rows().filter(mine(me)).find((x) => String(x[key]) === String(id));
    if (!r) throw new HttpError(404, "NOT_FOUND", `${name}/${id} does not exist`);
    return r;
  };
  const byEmail = (email) => rows().find((r) => r.email === email) ?? null;
  const check = (row, me) => {
    for (const [f, { api, list }] of Object.entries(refs)) {
      const t = tables[api];
      const v = row[f];
      if (!t || v === null || v === undefined) continue;
      const idOf = (x) => (x && typeof x === "object" ? x[t.key] : x);
      row[f] = list && Array.isArray(v) ? v.map(idOf) : list ? v : idOf(v);
      for (const id of list ? (Array.isArray(row[f]) ? row[f] : []) : [row[f]]) {
        if (typeof id !== "string") continue;
        try { t.find(id, me ?? ALL); } catch {
          throw new HttpError(400, "VALIDATION", `invalid ${f}: ${api}/${id} does not exist`, { field: f, expected: `an id of ${api}`, actual: JSON.stringify(id) });
        }
      }
    }
    const e = validate(vschema, model, row);
    if (e) throw new HttpError(400, "VALIDATION", `invalid ${e.field}: expected ${e.expected}, got ${e.actual}`, e);
    for (const [f, r] of Object.entries(schema.rules?.[model] ?? {})) {
      const v = row[f];
      const bad = (expected, actual) => { throw new HttpError(400, "VALIDATION", `invalid ${f}: expected ${expected}, got ${actual}`, { field: f, expected, actual }); };
      if (v === null || v === undefined) continue;
      if (/^File/.test(fields[f])) {
        for (const file of Array.isArray(v) ? v : [v]) {
          if (r.max !== undefined && file.size > r.max) bad(`at most ${r.max} bytes`, `${file.size} bytes`);
        }
        continue;
      }
      const size = typeof v === "number" ? v : v.length;
      const unit = typeof v === "number" ? "" : Array.isArray(v) ? " items" : " characters";
      if (r.min !== undefined && size < r.min) bad(`at least ${r.min}${unit}`, `${size}${unit}`);
      if (r.max !== undefined && size > r.max) bad(`at most ${r.max}${unit}`, `${size}${unit}`);
      if (r.match !== undefined && !new RegExp(r.match).test(v)) bad(`text matching /${r.match}/`, JSON.stringify(v));
      if (r.unique) {
        const other = rows().find((x) => x[f] === v);
        if (other && other[key] !== row[key]) throw new HttpError(409, "CONFLICT", `${f} ${JSON.stringify(v)} is already used`, { field: f });
      }
    }
    if (isAuth && !String(row.password).startsWith("demo$")) {
      if (row.password.length < MIN_PASSWORD) throw new HttpError(400, "VALIDATION", `invalid password: expected at least ${MIN_PASSWORD} characters`, { field: "password", expected: `String (min ${MIN_PASSWORD})`, actual: `${row.password.length} characters` });
      row.password = hashed(row.password);
    }
    if (isAuth) {
      const other = byEmail(row.email);
      if (other && other[key] !== row[key]) throw new HttpError(409, "CONFLICT", `email '${row.email}' is already registered`);
    }
  };
  const table = {
    name, model, access, readonly, key, isAuth, out, byEmail, find, refs, peek,
    list(me, q) {
      let found = select(q, me);
      if (q?.sort) {
        const desc = String(q.sort).startsWith("-");
        const f = field(String(q.sort).replace(/^-/, ""));
        const cmp = (a, b) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1);
        found = found.map((r, i) => [r, i]).sort((a, b) => (desc ? -1 : 1) * cmp(a[0][f], b[0][f]) || a[1] - b[1]).map((x) => x[0]);
      }
      const limit = Math.min(Math.max(Number(q?.limit ?? MAX_LIMIT) | 0, 0), MAX_LIMIT);
      const offset = Math.max(Number(q?.offset ?? 0) | 0, 0);
      const include = Array.isArray(q?.include) ? q.include.map(String) : [];
      return found.slice(offset, offset + limit).map((r) => out(r, true, include));
    },
    count: (me, q) => select({ where: q?.where, search: q?.search }, me).length,
    get: (id, me) => out(find(id, me)),
    hasAdmin: () => rows().some((r) => r.role === "admin"),
    create(body, me) {
      const row = structuredClone(body ?? {});
      for (const [f, v] of Object.entries(defaults)) if (row[f] === undefined) row[f] = structuredClone(v);
      for (const [f, t] of Object.entries(fields)) if (row[f] === undefined && t.endsWith("[]")) row[f] = [];
      if (key && (row[key] === undefined || row[key] === null)) row[key] = uuid();
      if (access === "private" && me && me !== ALL) row.owner = String(me[userKey]);
      check(row, me);
      if (peek(row[key])) throw new HttpError(409, "CONFLICT", `${key} '${row[key]}' already exists`);
      rows().push(row);
      save();
      return out(row);
    },
    update(id, changes, me, replace = false) {
      const prev = find(id, me);
      const fixed = { ...(key ? { [key]: prev[key] } : {}), ...(access === "private" ? { owner: prev.owner } : {}) };
      const row = { ...(replace ? {} : structuredClone(prev)), ...structuredClone(changes ?? {}), ...fixed };
      if (isAuth && changes.password === undefined) row.password = prev.password;
      check(row, me);
      rows()[rows().indexOf(prev)] = row;
      save();
      return out(row);
    },
    // Rows that reference this one block the delete (409), unless their field is `cascade`.
    remove(id, me) {
      const prev = find(id, me);
      const before = JSON.stringify(store.tables);
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
        rows().splice(rows().indexOf(peek(prev[key])), 1);
        save();
      } catch (e) {
        store.tables = JSON.parse(before); // all or nothing
        throw e;
      }
      return null;
    },
    link: (all) => { tables = all; },
    referencing: (f, list, id) => rows().filter((r) => (list ? Array.isArray(r[f]) && r[f].includes(String(id)) : r[f] === String(id))).map((r) => r[key]),
  };
  return table;
}

// Installs the backend: requests to `<base>/api/...` are answered here instead of going to the network.
export function installDemo(schema, fns = {}, jobs = {}, base = "") {
  if (typeof localStorage === "undefined" || globalThis.__artSSR || globalThis.__artStatic) return;
  const KEY = `art-demo:${base || "/"}`;
  let store = { tables: {}, session: null, jobs: {} };
  try { store = { ...store, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { /* a fresh start */ }
  // Uploaded files live in the row as data: URLs; if the browser's storage fills up, the demo goes
  // on in memory for this visit.
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full */ } };
  const tables = Object.fromEntries(Object.entries(schema.apis).map(([n, a]) => [n, makeTable(schema, store, save, n, a)]));
  for (const t of Object.values(tables)) t.link(tables);
  const users = schema.auth ? tables[schema.auth] : null;
  const hasRoles = !!users && "role" in (schema.models[users.model] ?? {});
  const isAdmin = (me) => hasRoles && me?.role === "admin";
  const currentUser = () => (users && store.session ? users.peek(store.session) : null);
  const db = Object.fromEntries(Object.entries(tables).map(([n, t]) => [n, {
    list: (q) => t.list(ALL, q),
    count: (q) => t.count(ALL, q),
    get: (id) => { try { return t.get(id, ALL); } catch { return null; } },
    create: (obj) => t.create(obj, ALL),
    update: (id, changes) => t.update(id, changes, ALL),
    remove: (id) => t.remove(id, ALL),
  }]));
  const fail = (message, status = 400) => { throw new HttpError(status, "FAILED", String(message)); };
  const email = async (to, subject, text) => console.info(`[demo] email to ${to}: ${subject}\n${text}`);

  async function handle(method, path, query, body, headers) {
    if (path === "_health") return [200, { ok: true }];
    if (path === "_files" && method === "POST") {
      const blob = body instanceof Blob ? body : new Blob([body ?? ""]);
      const url = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
      return [201, { url, name: decodeURIComponent(headers.get("x-file-name") ?? "file"), type: (headers.get("content-type") ?? blob.type ?? "application/octet-stream").split(";")[0], size: blob.size }];
    }
    const me = currentUser();
    const publicMe = me && users.out(me);
    const a = /^_auth\/(signup|login|logout|logout-all|me|reset-request|reset|verify)$/.exec(path);
    if (a) {
      if (!users) throw new HttpError(404, "NOT_FOUND", "auth is not enabled");
      if (a[1] === "me") return [200, publicMe];
      if (a[1] === "logout" || a[1] === "logout-all") { store.session = null; save(); return [204]; }
      if (a[1] === "signup") {
        const verifies = schema.models[users.model]?.verified === "Bool";
        const user = users.create({ ...body, ...(hasRoles ? { role: users.hasAdmin() ? "user" : "admin" } : {}), ...(verifies ? { verified: true } : {}) }, ALL);
        store.session = String(user[users.key]);
        save();
        return [201, user];
      }
      if (a[1] === "login") {
        const user = users.byEmail(body?.email);
        if (!user || typeof body?.password !== "string" || user.password !== hashed(body.password)) throw new HttpError(401, "LOGIN_FAILED", "wrong email or password");
        store.session = String(user[users.key]);
        save();
        return [200, users.out(user)];
      }
      // Reset and verification need real email: the demo accepts them without one.
      return [204];
    }
    const f = /^_fn\/([\w$]+)$/.exec(path);
    if (f) {
      if (!Object.hasOwn(fns, f[1]) || method !== "POST") throw new HttpError(404, "NOT_FOUND", `no server fn named '${f[1]}'`);
      const result = await fns[f[1]]({ db, me: publicMe, fail, email }, ...(Array.isArray(body?.args) ? body.args : []));
      // Like a response over the network: the caller gets its own copy.
      return [200, result === undefined ? null : JSON.parse(JSON.stringify(result))];
    }
    const m = /^([\w-]+)(?:\/([^/]+))?\/?$/.exec(path);
    const t = m && tables[m[1]];
    if (!t) throw new HttpError(404, "NOT_FOUND", `no api named '${m?.[1] ?? path}'`);
    const write = method !== "GET";
    if ((t.access === "login" || t.access === "private" || t.isAuth || (t.access === "admin" && write)) && !me) throw new HttpError(401, "LOGIN_REQUIRED", `log in to use /api/${t.name}`);
    if (t.access === "admin" && write && !isAdmin(me)) throw new HttpError(403, "FORBIDDEN", `only admins can change /api/${t.name}`);
    if (t.readonly && write) throw new HttpError(403, "FORBIDDEN", `/api/${t.name} is read-only`);
    const id = m[2] === undefined ? null : decodeURIComponent(m[2]);
    if (t.isAuth && write) {
      if (id === null) throw new HttpError(403, "FORBIDDEN", "create accounts with auth.signup");
      if (String(me[t.key]) !== id && !isAdmin(me)) throw new HttpError(403, "FORBIDDEN", "you can only change your own account");
      if (hasRoles && body && "role" in body && !isAdmin(me)) throw new HttpError(403, "FORBIDDEN", "only admins can change roles");
    }
    if (method === "GET") {
      let q;
      try { q = query.has("q") ? JSON.parse(query.get("q")) : {}; } catch { throw new HttpError(400, "BAD_QUERY", "q must be JSON"); }
      if (id === "_count") return [200, t.count(me, q)];
      return [200, id === null ? t.list(me, q) : t.get(id, me)];
    }
    if (method === "POST" && id === null) return [201, t.create(body, me)];
    if ((method === "PATCH" || method === "PUT") && id !== null) return [200, t.update(id, body, me, method === "PUT")];
    if (method === "DELETE" && id !== null) return [204, t.remove(id, me) ?? undefined];
    throw new HttpError(405, "METHOD_NOT_ALLOWED", `${method} not allowed here`);
  }

  const network = globalThis.fetch?.bind(globalThis);
  const prefix = `${base.replace(/\/+$/, "")}/api/`;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return network(input, init);
    const method = (init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init.headers ?? {});
    const path = url.pathname.slice(prefix.length);
    // `data ... live`: a stream that stays open (nobody else writes to this visitor's data).
    if (path === "_events") return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "content-type": "text/event-stream" } });
    let body = init.body;
    if (typeof body === "string" && (headers.get("content-type") ?? "").startsWith("application/json")) {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }
    let status, data;
    try {
      [status, data] = await handle(method, path, url.searchParams, body, headers);
    } catch (e) {
      if (e instanceof HttpError) { status = e.status; data = e.body; }
      else { console.error(e); status = 500; data = { error: "SERVER_ERROR", message: String(e?.message ?? e) }; }
    }
    return new Response(status === 204 ? null : JSON.stringify(data ?? null), { status, headers: { "content-type": "application/json" } });
  };

  // `server job`s run while the page is open, when they are due (the last run is remembered).
  for (const [name, job] of Object.entries(jobs)) {
    store.jobs[name] ??= Date.now();
    let running = false;
    const tick = async () => {
      if (running || Date.now() - store.jobs[name] < job.every) return;
      running = true;
      store.jobs[name] = Date.now();
      try { await job.run({ db, fail, email }); save(); } catch (e) { console.error(`server job ${name}:`, e?.message ?? e); } finally { running = false; }
    };
    setInterval(tick, Math.min(job.every, 60_000));
    setTimeout(tick, 1000);
  }

  // What this is, and a way to start over.
  globalThis.__artDemo = { reset() { localStorage.removeItem(KEY); location.reload(); } };
  const note = () => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = "Demo · Reset";
    pill.title = "This demo's backend runs in your browser: your data stays here. Click to erase it and start over.";
    pill.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:99990;font:12px/1.4 system-ui,sans-serif;padding:4px 10px;border-radius:999px;border:1px solid #0002;background:#111c;color:#fff;cursor:pointer;backdrop-filter:blur(6px);opacity:.75";
    pill.onclick = () => { if (confirm("Erase this demo's data and start over?")) globalThis.__artDemo.reset(); };
    document.body.appendChild(pill);
  };
  if (document.body) note(); else document.addEventListener("DOMContentLoaded", note);
}
