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

// Lazy: marked dirty when a dependency changes, recomputed on read.
class Computed {
  constructor(fn) { this.fn = fn; this.subs = new Set(); this.deps = new Set(); this.dirty = true; }
  get v() {
    if (this.dirty) { this._v = run(this, this.fn); this.dirty = false; }
    track(this);
    return this._v;
  }
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
      if (guard > 1e4) throw new Error("ArtScript: ciclo reactivo infinito");
      const list = [...queue];
      queue.clear();
      for (const e of list) e.run();
    }
  } finally { flushing = false; }
}

export function onDispose(f) { if (owner) owner.push(f); }
export const signal = (v) => new Signal(v);
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
export function $m(sig, value) { if (sig) sig.notify(); return value; }
// Prop that references a parent state: mutating its fields notifies the owner.
export function $ref(get, sig) { get.sig = sig; return get; }

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
export function $attr(n, name, fn) {
  effect(() => {
    const v = fn();
    if (name in n) n[name] = v ?? "";
    else if (v == null || v === false) n.removeAttribute(name);
    else n.setAttribute(name, v === true ? "" : v);
  });
}
export function $style(n, prop, fn) { effect(() => { n.style[prop] = str(fn()); }); }
export function $on(n, kind, fn) {
  const type = kind === "enter" ? "keydown" : kind;
  n.addEventListener(type, (e) => {
    if (kind === "enter" && e.key !== "Enter") return;
    if (kind === "submit") e.preventDefault();
    batch(() => fn(e));
  });
}
// Two-way input binding. `mode`: "value" | "number" | "checked".
export function $bind(n, get, set, mode) {
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

// TODO: keyed reconciliation. For now the whole list re-renders on change.
export function $for(parent, list, render) {
  const r = region(parent);
  effect(() => {
    const items = list() ?? [];
    r.clear();
    r.mount((frag) => items.forEach((it, i) => r.disposers.push(root(() => render(frag, it, i)))));
  });
}

// ---------- App ----------
const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#1a1a1a;background:#fafafa}#app{padding:24px;max-width:960px;margin:0 auto}.a-row{display:flex;align-items:center}.a-column{display:flex;flex-direction:column}.a-grid{display:grid}.a-wrap{flex-wrap:wrap}.a-card{display:flex;flex-direction:column;padding:16px;border:1px solid #e5e5e5;border-radius:12px;background:#fff}button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #d4d4d4;background:#fff;color:inherit;cursor:pointer}button.a-primary{background:#2563eb;border-color:#2563eb;color:#fff}button.a-danger{color:#dc2626;border-color:#fca5a5}button.a-small{padding:2px 8px;font-size:.875em}input{font:inherit}input:not([type=checkbox]){padding:6px 10px;border:1px solid #d4d4d4;border-radius:8px;background:inherit;color:inherit}.a-bold{font-weight:600}.a-muted{color:#737373}.a-small{font-size:.875em}.a-large{font-size:1.25em}h2{margin:0}a{color:#2563eb}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}.a-card{background:#1a1a1a;border-color:#333}button{background:#222;border-color:#444}input:not([type=checkbox]){border-color:#444}.a-muted{color:#999}}`;

export function start(routes, mount = document.getElementById("app")) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  let dispose = null;
  const render = () => {
    const path = (location.hash.slice(1) || "/").split("?")[0];
    const r = routes.find((x) => x.path === path) ?? routes[0];
    if (dispose) dispose();
    mount.textContent = "";
    dispose = root(() => r.comp({}, mount));
  };
  window.addEventListener("hashchange", render);
  render();
}
