// ArtScript runtime: signal-based reactivity + minimal DOM helpers. No dependencies.

let listener = null; // computation currently tracking dependencies
let owner = null; // disposers of the current scope
let depth = 0;
let flushing = false;
const queue = new Set();

function track(src) {
  if (listener) { src.subs.add(listener); listener.deps.add(src); }
}
function unsub(c) {
  for (const d of c.deps) d.subs.delete(c);
  c.deps.clear();
}
function run(c, fn) {
  unsub(c);
  const prev = listener;
  listener = c;
  try { return fn(); } finally { listener = prev; }
}

class Signal {
  constructor(v) { this._v = v; this.subs = new Set(); }
  get v() { track(this); return this._v; }
  set v(n) { if (!Object.is(n, this._v)) { this._v = n; this.notify(); } }
  notify() { batch(() => { for (const s of [...this.subs]) s.mark(); }); }
}

// Lazy: marked dirty when a dependency changes, recomputed on read. Assigning it overrides the
// value until a dependency changes (like Svelte 5's writable $derived).
class Computed {
  constructor(fn) { this.fn = fn; this.subs = new Set(); this.deps = new Set(); this.dirty = true; }
  get v() {
    if (this.dirty) { this._v = run(this, this.fn); this.dirty = false; }
    track(this);
    return this._v;
  }
  set v(n) {
    if (this.dirty) { this._v = run(this, this.fn); this.dirty = false; } // track its dependencies first
    if (!Object.is(n, this._v)) { this._v = n; this.notify(); }
  }
  notify() { batch(() => { for (const s of [...this.subs]) s.mark(); }); }
  mark() {
    if (this.dirty) return;
    this.dirty = true;
    for (const s of [...this.subs]) s.mark();
  }
}

class Effect {
  constructor(fn) { this.fn = fn; this.deps = new Set(); this.alive = true; }
  mark() { queue.add(this); }
  run() { if (this.alive) run(this, this.fn); }
}

export function batch(fn) {
  depth++;
  try { return fn(); } finally { if (--depth === 0) flush(); }
}
function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (let guard = 0; queue.size; guard++) {
      if (guard > 1e4) throw new Error("ArtScript: infinite reactive loop");
      const list = [...queue];
      queue.clear();
      for (const e of list) e.run();
    }
  } finally { flushing = false; }
}

export function onDispose(f) { if (owner) owner.push(f); }
// Every live `state` and `data`, so a mutation through an untracked alias (a fn or arrow parameter:
// `fn add(p) { p.stock-- }`) can still update the screen: `$all` notifies them all.
const states = new Set();
export function signal(v) {
  const s = new Signal(v);
  states.add(s);
  onDispose(() => states.delete(s));
  return s;
}
export const $all = { notify() { if (!listener) batch(() => { for (const s of [...states]) s.notify(); }); } };
export function computed(fn) {
  const c = new Computed(fn);
  onDispose(() => unsub(c));
  return c;
}
export function effect(fn) {
  const e = new Effect(fn);
  e.run();
  onDispose(() => { e.alive = false; unsub(e); });
}
// Creates an isolated scope; returns the function that disposes it.
export function root(fn) {
  const o = [], po = owner, pl = listener;
  owner = o;
  listener = null;
  try { fn(); } finally { owner = po; listener = pl; }
  return () => { for (const f of o.splice(0)) f(); };
}
// Notifies an in-place mutation (e.g. `todos.push(x)`) and returns its result.
// Not while a computed is being calculated (`filtered.sort()` inside another computed).
export function $m(sig, value) { if (sig && !(listener instanceof Computed)) sig.notify(); return value; }
// Prop that references a parent state: mutating its fields notifies the owner.
// `set`: the prop is bound two-way (`items = ...` in the child assigns the parent's state).
export function $ref(get, sig, set) { get.sig = sig; get.set = set; return get; }

// ---------- DOM ----------
const str = (v) => (v == null ? "" : String(v));
const remove = (n) => n.parentNode && n.parentNode.removeChild(n);

export function $el(parent, tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  parent.appendChild(n);
  return n;
}
export function $text(n, fn) { effect(() => { n.textContent = str(fn()); }); }
// URLs from data can't run code: `javascript:` (and `vbscript:`, `data:text/html`) become "#".
const URL_ATTRS = new Set(["href", "src", "action", "formAction", "poster"]);
const unsafeUrl = (v) => typeof v === "string" && /^\s*(javascript|vbscript|data:text\/html)/i.test(v.replace(/[\u0000-\u001f]/g, ""));
export function $attr(n, name, fn) {
  effect(() => {
    let v = fn();
    if (URL_ATTRS.has(name) && unsafeUrl(v)) v = "#";
    if (name in n) n[name] = v ?? "";
    else if (v == null || v === false) n.removeAttribute(name);
    else n.setAttribute(name, v === true ? "" : v);
  });
}
// Adds a class whose rule is generated on demand (responsive props), once per page.
let sheet = null;
const rules = new Set();
export function $css(n, cls, rule) {
  n.classList.add(cls);
  if (rules.has(cls)) return;
  rules.add(cls);
  sheet ??= document.head.appendChild(document.createElement("style"));
  sheet.textContent += rule;
}
export function $class(n, cls, fn) { effect(() => { n.classList.toggle(cls, !!fn()); }); }
export function $style(n, prop, fn) { effect(() => { n.style[prop] = str(fn()); }); }
export function $on(n, kind, fn) {
  const type = kind === "enter" ? "keydown" : kind;
  n.addEventListener(type, (e) => {
    if (kind === "enter" && e.key !== "Enter") return;
    if (kind === "submit") e.preventDefault();
    batch(() => fn(e));
  });
}
function untrack(fn) {
  const prev = listener;
  listener = null;
  try { return fn(); } finally { listener = prev; }
}

// Two-way binding. `mode`: "value" | "number" | "checked" | "file" | "open" (modal).
export function $bind(n, get, set, mode) {
  if (mode === "file") {
    effect(() => { const v = get(); if (v == null || v.length === 0) n.value = ""; });
    n.addEventListener("change", () => batch(() => set(n.multiple ? [...n.files] : n.files[0] ?? null)));
    return;
  }
  if (mode === "open") {
    effect(() => {
      const open = !!get();
      const apply = () => {
        if (open === n.open) return;
        if (open) n.showModal ? n.showModal() : n.setAttribute("open", "");
        else n.close ? n.close() : n.removeAttribute("open");
      };
      n.isConnected ? apply() : queueMicrotask(apply); // showModal needs the dialog in the page
    });
    n.addEventListener("close", () => batch(() => set(false)));
    n.addEventListener("click", (e) => { // click on the backdrop closes
      const r = n.getBoundingClientRect();
      if (e.target === n && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) n.close?.();
    });
    return;
  }
  const prop = mode === "checked" ? "checked" : "value";
  effect(() => {
    const v = get();
    const next = mode === "checked" ? !!v : str(v);
    if (n[prop] !== next) n[prop] = next;
  });
  n.addEventListener(mode === "checked" ? "change" : "input", () => {
    batch(() => set(mode === "checked" ? n.checked : mode === "number" ? Number(n.value) : n.value));
  });
}

// One value out of `options` (strings, or objects with value/id and label/name): select, radio, tabs.
// The state keeps the option's original value (a Number stays a Number).
const optionOf = (it) => it !== null && typeof it === "object"
  ? { value: it.value ?? it.id, label: str(it.label ?? it.name ?? it.value ?? it.id) }
  : { value: it, label: str(it) };
let groups = 0;
export function $choice(n, kind, options, get, set) {
  let items = [];
  const name = `a-choice-${++groups}`;
  const pick = (it) => batch(() => set(it ? it.value : null));
  const sync = (v) => {
    const i = items.findIndex((it) => it.value === v || (v != null && str(it.value) === str(v)));
    if (kind === "select") n.selectedIndex = i < 0 ? (n.$placeholder != null ? 0 : -1) : i + (n.$placeholder != null ? 1 : 0);
    else [...n.children].forEach((c, j) => {
      if (kind === "tabs") { c.setAttribute("aria-selected", String(i === j)); c.classList.toggle("a-active", i === j); }
      else c.firstChild.checked = i === j;
    });
  };
  if (kind === "select") n.addEventListener("change", () => pick(items[n.selectedIndex - (n.$placeholder != null ? 1 : 0)]));
  else n.setAttribute("role", kind === "tabs" ? "tablist" : "radiogroup");
  effect(() => {
    items = (options() ?? []).map(optionOf);
    n.textContent = "";
    if (kind === "select" && n.$placeholder != null) {
      const o = $el(n, "option");
      o.value = "";
      o.disabled = true;
      o.textContent = n.$placeholder;
    }
    for (const it of items) {
      if (kind === "select") $el(n, "option").textContent = it.label;
      else if (kind === "tabs") {
        const b = $el(n, "button");
        b.type = "button";
        b.setAttribute("role", "tab");
        b.textContent = it.label;
        b.addEventListener("click", () => { pick(it); n.dispatchEvent(new Event("change")); });
      } else {
        const l = $el(n, "label", "a-check");
        const i = $el(l, "input");
        i.type = "radio";
        i.name = name;
        i.addEventListener("change", () => pick(it));
        $el(l, "span").textContent = it.label;
      }
    }
    sync(untrack(get));
  });
  effect(() => sync(get()));
}

// Renders fragments before an anchor; disposes them on change.
function region(parent) {
  const anchor = document.createComment("");
  parent.appendChild(anchor);
  const r = {
    nodes: [], disposers: [],
    clear() {
      for (const d of r.disposers.splice(0)) d();
      for (const n of r.nodes.splice(0)) remove(n);
    },
    mount(fill) {
      const frag = document.createDocumentFragment();
      fill(frag);
      r.nodes = [...frag.childNodes];
      anchor.parentNode.insertBefore(frag, anchor);
    },
  };
  onDispose(r.clear);
  return r;
}

export function $if(parent, cond, a, b) {
  const r = region(parent);
  let last;
  effect(() => {
    const c = !!cond();
    if (c === last) return;
    last = c;
    r.clear();
    const f = c ? a : b;
    if (f) r.mount((frag) => r.disposers.push(root(() => f(frag))));
  });
}

// Keyed list: rows whose key (default: the item itself) survives an update keep their DOM and
// get the new item through their signal; only new rows render and only moved rows move.
export function $for(parent, list, render, key = (it) => it) {
  const anchor = document.createComment("");
  parent.appendChild(anchor);
  let rows = [];
  const range = (r) => {
    const out = [];
    for (let n = r.start; ; n = n.nextSibling) { out.push(n); if (n === r.end) return out; }
  };
  const drop = (r) => { r.dispose(); for (const n of range(r)) remove(n); };
  onDispose(() => { rows.forEach(drop); rows = []; });
  effect(() => {
    const items = list() ?? [];
    const old = new Map();
    for (const r of rows) old.has(r.key) ? old.get(r.key).push(r) : old.set(r.key, [r]);
    const kept = [];
    const next = items.map((it, i) => {
      const k = key(it, i);
      const r = old.get(k)?.shift();
      if (r) {
        r.item._v = it; // always notified below: the item may have been mutated in place
        if (r.index._v !== i) { r.index._v = i; kept.push(r.index); }
        kept.push(r.item);
        return r;
      }
      const n = { key: k, item: new Signal(it), index: new Signal(i), start: document.createComment(""), end: document.createComment("") };
      const frag = document.createDocumentFragment();
      frag.appendChild(n.start);
      n.dispose = root(() => render(frag, n.item, n.index));
      frag.appendChild(n.end);
      return n;
    });
    for (const rs of old.values()) rs.forEach(drop);
    rows = next;
    let ref = anchor;
    for (let j = next.length - 1; j >= 0; j--) {
      const r = next[j];
      if (r.end.nextSibling !== ref || r.end.parentNode !== anchor.parentNode) {
        for (const n of range(r)) anchor.parentNode.insertBefore(n, ref);
      }
      ref = r.start;
    }
    untrack(() => batch(() => kept.forEach((s) => s.notify())));
  });
}

// `mount { ... }`: runs once the view is in the page; `cleanup { }` inside runs on unmount.
export function $mount(fn) {
  const o = owner;
  let alive = true;
  onDispose(() => { alive = false; });
  queueMicrotask(() => {
    if (!alive) return;
    const prev = owner;
    owner = o;
    try { fn(); } finally { owner = prev; }
  });
}

// `effect { ... }`: re-runs when what it reads changes; its `cleanup { }` runs before each re-run.
export function $effect(fn) {
  const cleanups = [];
  const clean = () => { for (const f of cleanups.splice(0)) f(); };
  $mount(() => {
    effect(() => {
      untrack(clean); // what a cleanup reads isn't a dependency of the effect
      const prev = owner;
      owner = cleanups;
      try { fn(); } finally { owner = prev; }
    });
    onDispose(clean);
  });
}

// ---------- API client ----------
let apiBase = "";
export function setApiBase(url) { apiBase = url; }

// Every read (api list/get, auth.me, server fns inside `data`) tracks this version; every write
// (create/update/remove, signup/login/logout, server fns called from actions) bumps it, so all
// `data` re-fetch. Simple and always correct, also when login changes what each user can see.
const dataVersion = new Signal(0);
const bump = (v) => { dataVersion.v = dataVersion._v + 1; return v; };

// A browser File (from `file x`) anywhere in a create/update is uploaded first and replaced by its
// { url, name, type, size }.
async function uploads(v) {
  if (typeof Blob !== "undefined" && v instanceof Blob) {
    const res = await fetch(`${apiBase}/api/_files`, {
      method: "POST", credentials: "same-origin", body: v,
      headers: { "content-type": v.type || "application/octet-stream", "x-file-name": encodeURIComponent(v.name ?? "file") },
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data?.message ?? res.statusText), { status: res.status, details: data });
    return data;
  }
  if (Array.isArray(v)) return Promise.all(v.map(uploads));
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = await uploads(x);
    return out;
  }
  return v;
}

// `quiet` reads resolve to null instead of failing when the resource is missing or needs a login.
async function request(method, path, body, quiet = method === "GET") {
  if (body !== undefined && method !== "GET") body = await uploads(body);
  // Writes are always JSON (the server requires it, as CSRF protection), even without a body.
  const init = method === "GET" ? { method } : { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  const res = await fetch(`${apiBase}/api/${path}`, { credentials: "same-origin", ...init });
  const data = res.status === 204 ? null : await res.json();
  if (res.ok) return data;
  if (quiet && (res.status === 404 || res.status === 401)) return null;
  throw Object.assign(new Error(data?.message ?? res.statusText), { status: res.status, details: data });
}

// Typed REST client for `api <name>: <Model>`.
export function $api(name) {
  const read = (path) => { dataVersion.v; return request("GET", path); };
  const at = (id) => `${name}/${encodeURIComponent(id)}`;
  const qs = (q) => (q && Object.keys(q).length ? `?q=${encodeURIComponent(JSON.stringify(q))}` : "");
  return {
    list: (q) => read(name + qs(q)),
    count: (q) => read(`${name}/_count${qs(q)}`),
    get: (id) => read(at(id)),
    create: (obj) => request("POST", name, obj).then(bump),
    update: (id, changes) => request("PATCH", at(id), changes).then(bump),
    remove: (id) => request("DELETE", at(id)).then(bump),
  };
}

// `auth`: email + password accounts with a cookie session.
export function $auth() {
  return {
    signup: (obj) => request("POST", "_auth/signup", obj).then(bump),
    login: (email, password) => request("POST", "_auth/login", { email, password }).then(bump),
    logout: () => request("POST", "_auth/logout").then(bump),
    logoutAll: () => request("POST", "_auth/logout-all").then(bump),
    requestReset: (email) => request("POST", "_auth/reset-request", { email }),
    resetPassword: (token, password) => request("POST", "_auth/reset", { token, password }).then(bump),
    verifyEmail: (token) => request("POST", "_auth/verify", { token }).then(bump),
    // Leaves the page for the provider, which sends the user back signed in.
    loginWith: (provider) => { location.href = `${apiBase}/api/_auth/oauth/${provider}`; },
    me: () => { dataVersion.v; return request("GET", "_auth/me"); },
  };
}

// `server.<fn>(...args)`: calls a `server fn`. Inside `data` it's a tracked read; from an action
// it may write, so it bumps the data version when it resolves.
export function $server() {
  return new Proxy({}, {
    get: (_, fn) => (...args) => {
      const reading = listener !== null;
      if (reading) dataVersion.v;
      const p = request("POST", `_fn/${String(fn)}`, { args }, reading);
      return reading ? p : p.then(bump);
    },
  });
}

// `data x = ... live`: one stream of server-sent events per page; each event names an api that
// changed, and every `data` reloads (they reload after this client's writes anyway). Reconnects.
let live = false;
export function $live() {
  if (live || typeof fetch === "undefined") return;
  live = true;
  const connect = async (wait) => {
    try {
      const res = await fetch(`${apiBase}/api/_events`, { credentials: "same-origin" });
      const reader = res.body.getReader();
      const text = new TextDecoder();
      let buf = "";
      wait = 500;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += text.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop();
        if (events.some((e) => e.startsWith("data:"))) bump();
      }
    } catch { /* retried below */ }
    // `unref`: in Node (tests, server rendering) a retry doesn't keep the process alive.
    setTimeout(() => connect(Math.min(wait * 2, 10000)), wait)?.unref?.();
  };
  connect(500);
}

// `data x = expr`: runs `expr` tracking its dependencies and stores the result when it resolves.
// Re-runs when a dependency changes; responses that arrive out of order are ignored.
// `x.loading` is true until the first response arrives (reloads keep showing the current data, so
// `if x.loading { spinner }` never flashes); `x.error` holds the last failure's message (null once
// a request succeeds); `x.reload()` requests it again.
export function $data(fn, initial) {
  const s = signal(initial);
  s.loading = new Signal(true);
  s.error = new Signal(null);
  const again = new Signal(0);
  s.reload = () => { again.v = again._v + 1; };
  let seq = 0;
  effect(() => {
    again.v;
    const id = ++seq;
    let p; // fn runs inside the effect, so what it reads (states, the data version) is tracked
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    p.then(
      (v) => { if (id === seq) batch(() => { s.v = v ?? initial; s.error.v = null; s.loading.v = false; }); },
      (e) => { if (id === seq) batch(() => { s.error.v = e?.message ?? String(e); s.loading.v = false; }); },
    );
  });
  return s;
}

// ---------- App ----------
// Theme: override the --a-* variables in your own CSS (`:root { --a-primary: #e11d48 }`).
const CSS = `:root{--a-primary:#2563eb;--a-danger:#dc2626;--a-success:#16a34a;--a-bg:#fafafa;--a-fg:#1a1a1a;--a-surface:#fff;--a-border:#e5e5e5;--a-input:#d4d4d4;--a-muted:#737373;--a-radius:8px;--a-font:system-ui,sans-serif}@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--a-bg:#111;--a-fg:#eee;--a-surface:#1a1a1a;--a-border:#333;--a-input:#444;--a-muted:#999;color-scheme:dark}}:root[data-theme=dark]{--a-bg:#111;--a-fg:#eee;--a-surface:#1a1a1a;--a-border:#333;--a-input:#444;--a-muted:#999;color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:16px/1.5 var(--a-font);color:var(--a-fg);background:var(--a-bg)}#app{padding:24px;max-width:960px;margin:0 auto}.a-row{display:flex;align-items:center}.a-column{display:flex;flex-direction:column}.a-grid{display:grid}.a-wrap{flex-wrap:wrap}.a-card{display:flex;flex-direction:column;padding:16px;border:1px solid var(--a-border);border-radius:calc(var(--a-radius) * 1.5);background:var(--a-surface)}button{font:inherit;padding:6px 14px;border-radius:var(--a-radius);border:1px solid var(--a-input);background:var(--a-surface);color:inherit;cursor:pointer}button.a-primary{background:var(--a-primary);border-color:var(--a-primary);color:#fff}button.a-danger{color:var(--a-danger);border-color:var(--a-danger)}button.a-small{padding:2px 8px;font-size:.875em}span.a-danger{color:var(--a-danger)}span.a-primary{color:var(--a-primary)}span.a-success{color:var(--a-success)}input,textarea,select{font:inherit;color:inherit}input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select{padding:6px 10px;border:1px solid var(--a-input);border-radius:var(--a-radius);background:inherit}.a-bold{font-weight:600}.a-muted{color:var(--a-muted)}.a-small{font-size:.875em}.a-large{font-size:1.25em}h2{margin:0}a{color:var(--a-primary)}.a-field{display:flex;flex-direction:column;gap:4px}.a-check{display:flex;flex-direction:row;align-items:center;gap:8px}.a-radio{display:flex;flex-direction:column;gap:4px}.a-tabs{display:flex;gap:4px;border-bottom:1px solid var(--a-border)}.a-tabs button{border:0;border-radius:var(--a-radius) var(--a-radius) 0 0;background:none}.a-tabs .a-active{box-shadow:inset 0 -2px var(--a-primary);font-weight:600}.a-modal{border:0;border-radius:calc(var(--a-radius) * 1.5);padding:20px;min-width:min(420px,90vw);background:var(--a-surface);color:inherit}.a-modal::backdrop{background:#0006}.a-badge{display:inline-block;padding:0 8px;border-radius:999px;font-size:.75em;background:var(--a-border)}.a-badge.a-primary{background:color-mix(in srgb,var(--a-primary) 15%,transparent);color:var(--a-primary)}.a-badge.a-success{background:color-mix(in srgb,var(--a-success) 15%,transparent);color:var(--a-success)}.a-badge.a-danger{background:color-mix(in srgb,var(--a-danger) 15%,transparent);color:var(--a-danger)}.a-spinner{display:inline-block;width:1em;height:1em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:a-spin .7s linear infinite}@keyframes a-spin{to{transform:rotate(360deg)}}hr{border:0;border-top:1px solid var(--a-border);margin:8px 0;width:100%}.a-toasts{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:100}.a-toast{padding:10px 16px;border-radius:var(--a-radius);background:var(--a-fg);color:var(--a-bg);box-shadow:0 4px 12px #0003}.a-toast.a-success{background:var(--a-success);color:#fff}.a-toast.a-danger{background:var(--a-danger);color:#fff}.a-list{margin:0;padding-left:20px}.a-icon{display:inline-flex;vertical-align:middle;line-height:0}.a-table{border-collapse:collapse;width:100%}.a-table th,.a-table td{text-align:left;padding:8px;border-bottom:1px solid var(--a-border)}video,img{max-width:100%}`;

// `meta title=... description=... image=...`: the page's title, description and Open Graph tags.
function metaTag(attr, key) {
  let m = document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute(attr, key);
    document.head.appendChild(m);
  }
  return m;
}
export function $meta(props) {
  if (props.title) effect(() => { const t = str(props.title()); document.title = t; metaTag("property", "og:title").setAttribute("content", t); });
  if (props.description) effect(() => { const d = str(props.description()); metaTag("name", "description").setAttribute("content", d); metaTag("property", "og:description").setAttribute("content", d); });
  if (props.image) effect(() => metaTag("property", "og:image").setAttribute("content", str(props.image())));
}

// `setTheme("dark" | "light" | "auto")`: remembered in this browser; "auto" follows the system.
// `theme()` reads it (reactive).
const themeSig = new Signal("auto");
const applyTheme = (mode) => {
  if (mode === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
};
export function setTheme(mode) {
  themeSig.v = mode;
  applyTheme(mode);
  try { localStorage.setItem("art-theme", mode); } catch { /* private mode */ }
}
export const theme = () => themeSig.v;

// `notify("Saved")` / `notify("Couldn't save", "danger")`: a message at the bottom of the screen
// for 4 seconds (kinds: info, success, danger). Announced to screen readers.
let toasts = null;
export function notify(text, kind = "info") {
  if (!toasts) {
    toasts = document.createElement("div");
    toasts.className = "a-toasts";
    toasts.setAttribute("role", "status");
    toasts.setAttribute("aria-live", "polite");
    document.body.appendChild(toasts);
  }
  const t = $el(toasts, "div", `a-toast a-${kind}`);
  t.textContent = str(text);
  setTimeout(() => remove(t), 4000);
}

// `icon "check"`: inline SVG (24x24, stroked with currentColor). `markup` is the compiler's constant.
export function $icon(parent, markup, size, label, cls) {
  const n = $el(parent, "span", cls);
  n.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${markup}</svg>`;
  if (label) { n.setAttribute("role", "img"); n.setAttribute("aria-label", label); }
  return n;
}

// ---------- Router (History API) ----------
// Routes: { path: "/products/:id" | "*", comp, layout? }. Internal <a href="/..."> clicks and
// navigate() change the URL without reloading; a layout stays mounted while its pages change.
let render = () => {};
export function navigate(to) {
  history.pushState(null, "", to);
  render();
}

function compileRoute(path) {
  if (path === "*") return { re: null, keys: [] };
  const keys = [];
  const pattern = path.replace(/\/+$/, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"));
  return { re: new RegExp(`^${pattern}/?$`), keys };
}

export function start(routes, mount = document.getElementById("app")) {
  // A prerendered page already has the styles; its HTML is replaced by the live app.
  if (!document.getElementById("art-css")) {
    const style = document.createElement("style");
    style.id = "art-css";
    style.textContent = CSS;
    document.head.insertBefore(style, document.head.firstChild); // first, so the app's CSS wins
  }
  mount.textContent = "";
  try { const saved = localStorage.getItem("art-theme"); if (saved) { themeSig._v = saved; applyTheme(saved); } } catch { /* no storage */ }
  const table = routes.map((r) => ({ ...r, ...compileRoute(r.path) }));
  let layout, layoutDispose = null, slot = null, pageDispose = null;

  render = () => {
    const path = location.pathname || "/";
    const query = Object.fromEntries(new URLSearchParams(location.search));
    let route = null, params = {};
    for (const r of table) {
      const m = r.re && r.re.exec(path);
      if (!m) continue;
      route = r;
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
    route ??= table.find((r) => r.path === "*") ?? table[0];
    // `requires login|admin`: ask who's signed in first; without access, go to /login (when the app
    // has it) or home. The api protects the data; this keeps the page from showing.
    if (route.requires) {
      const want = route;
      request("GET", "_auth/me").then((me) => {
        if (location.pathname !== path) return; // navigated away meanwhile
        const ok = me && (want.requires === "login" || me.role === "admin");
        if (ok) show(want, params, query);
        else navigate(!me && table.some((r) => r.path === "/login") ? "/login" : "/");
      }, () => navigate("/"));
      return;
    }
    show(route, params, query);
  };

  const show = (route, params, query) => {
    const props = { params: () => params, query: () => query };
    pageDispose?.();
    pageDispose = null;
    if (route.layout !== layout || !route.layout) {
      layoutDispose?.();
      layoutDispose = null;
      slot = null;
      mount.textContent = "";
      layout = route.layout;
      if (layout) layoutDispose = root(() => layout({ $slot: (parent) => { slot = region(parent); } }, mount));
    }
    if (slot) {
      slot.clear();
      slot.mount((frag) => slot.disposers.push(root(() => route.comp(props, frag))));
    } else {
      pageDispose = root(() => route.comp(props, mount));
    }
    window.scrollTo?.(0, 0);
  };

  window.addEventListener("popstate", render);
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  render();
}
