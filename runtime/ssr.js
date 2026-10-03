// A minimal DOM for rendering an app to HTML at build time (`art build --prerender`): just what the
// ArtScript runtime uses. Never shipped to the browser. No dependencies.

const VOID = new Set(["input", "img", "hr", "br", "meta", "link", "source"]);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const kebab = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

class Node {
  constructor() { this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() {
    const l = this.parentNode?.childNodes;
    return l ? l[l.indexOf(this) + 1] ?? null : null;
  }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === document; }
  get children() { return this.childNodes.filter((c) => c instanceof Element); }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    const list = n instanceof Fragment ? [...n.childNodes] : [n];
    for (const c of list) {
      c.parentNode?.removeChild(c);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
      c.parentNode = this;
    }
    return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (v !== "" && v != null) this.appendChild(new Text(String(v)));
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
  html() { return this.childNodes.map((c) => c.html()).join(""); }
}

Object.defineProperty(Node.prototype, "nodeType", { get() { return this instanceof Element ? 1 : this instanceof Text ? 3 : this instanceof Comment ? 8 : 11; } });

class Text extends Node {
  constructor(data) { super(); this.data = data; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  html() { return esc(this.data); }
}

class Comment extends Node {
  get textContent() { return ""; }
  set textContent(_v) {}
  html() { return ""; } // anchors are for the live app, which renders again
}

class Fragment extends Node {}

// Markup set with innerHTML (icons): written out as is.
class Raw extends Node {
  constructor(html) { super(); this.raw = html; }
  get textContent() { return ""; }
  html() { return this.raw; }
}

// Properties the runtime sets directly that show up as HTML attributes.
const REFLECTED = ["id", "href", "src", "alt", "type", "placeholder", "name", "rows", "accept", "width", "height", "poster", "title", "role"];
const BOOLEAN = ["disabled", "checked", "multiple", "required", "controls", "autoplay", "loop", "muted", "open", "selected", "hidden"];

// `el.style`: properties (`style.gap = "8px"`) plus an inline style written as text (`cssText`).
class Style {
  get cssText() {
    return [...Object.entries(this).filter(([k, v]) => k !== "$text" && v !== "" && v != null).map(([k, v]) => `${k.startsWith("--") ? k : kebab(k)}:${v}`), ...(this.$text ? [this.$text] : [])].join(";");
  }
  set cssText(v) {
    for (const k of Object.keys(this)) delete this[k];
    this.$text = String(v ?? "").replace(/^[;\s]+|[;\s]+$/g, "");
  }
  setProperty(k, v) { this[k] = v; }
}

class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.$style = new Style();
    this.value = "";
    this.selectedIndex = -1;
    const el = this;
    this.classList = {
      add(...cs) { const s = new Set(el.className.split(" ").filter(Boolean)); for (const c of cs) s.add(c); el.className = [...s].join(" "); },
      remove(...cs) { const s = new Set(el.className.split(" ").filter(Boolean)); for (const c of cs) s.delete(c); el.className = [...s].join(" "); },
      toggle(c, on) { const s = new Set(el.className.split(" ").filter(Boolean)); if (on) s.add(c); else s.delete(c); el.className = [...s].join(" "); },
    };
  }
  get className() { return this.attrs.get("class") ?? ""; }
  set className(v) { if (v) this.attrs.set("class", String(v)); else this.attrs.delete("class"); }
  get options() { return this.children.filter((c) => c.tagName === "OPTION"); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  getElementById(id) {
    for (const c of this.children) {
      if (c.attrs.get("id") === id) return c;
      const f = c.getElementById(id);
      if (f) return f;
    }
    return null;
  }
  querySelector(sel) {
    const m = /^(\w+)\[(\w+)="([^"]*)"\]$/.exec(sel);
    for (const c of this.children) {
      if (m && c.tagName === m[1].toUpperCase() && c.attrs.get(m[2]) === m[3]) return c;
      const f = c.querySelector(sel);
      if (f) return f;
    }
    return null;
  }
  set innerHTML(v) { this.textContent = ""; this.appendChild(new Raw(String(v))); }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0 }; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  get style() { return this.$style; }
  set style(v) { this.$style.cssText = v; }
  html() {
    const tag = this.tagName.toLowerCase();
    const attrs = [...this.attrs];
    const css = this.$style.cssText;
    if (css) attrs.push(["style", css]);
    if ((tag === "input" || tag === "textarea") && this.value !== "" && tag === "input") attrs.push(["value", this.value]);
    const open = `<${tag}${attrs.map(([k, v]) => (v === "" && BOOLEAN.includes(k) ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join("")}>`;
    if (VOID.has(tag)) return open;
    const inner = tag === "textarea" ? esc(this.value) : super.html();
    return `${open}${inner}</${tag}>`;
  }
}
for (const p of REFLECTED) {
  Object.defineProperty(Element.prototype, p, {
    get() { return this.attrs.get(p) ?? ""; },
    set(v) { if (v === null || v === undefined || v === "") this.attrs.delete(p); else this.attrs.set(p, String(v)); },
  });
}
for (const p of BOOLEAN) {
  Object.defineProperty(Element.prototype, p, {
    get() { return this.attrs.has(p); },
    set(v) { if (v) this.attrs.set(p, ""); else this.attrs.delete(p); },
  });
}

class Document extends Node {
  constructor() {
    super();
    this.documentElement = new Element("html");
    this.head = new Element("head");
    this.body = new Element("body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.title = "";
  }
  createElement(tag) { return new Element(tag); }
  createTextNode(s) { return new Text(s); }
  createComment() { return new Comment(); }
  createDocumentFragment() { return new Fragment(); }
  getElementById(id) { return this.documentElement.getElementById(id); }
  querySelector(sel) { return this.documentElement.querySelector(sel); }
}

let document;

// Renders the app bundle at `bundleUrl` for `path`: installs this DOM as the globals the runtime
// uses, imports the bundle (it starts itself), waits for mounts, and returns the HTML of #app, the
// page's <head> additions (title, meta, the runtime's CSS) and its title. Requests never resolve,
// so `data` stays in its loading state.
const inner = (el) => el.childNodes.map((c) => c.html()).join("");
// The <head> the app added, minus the runtime's styles: the page links them as app.css.
const headOf = (doc) => doc.head.childNodes.filter((c) => c.attrs?.get("id") !== "art-css").map((c) => c.html()).join("");

export async function prerender(bundleUrl, path) {
  document = new Document();
  const app = new Element("div");
  app.setAttribute("id", "app");
  document.body.appendChild(app);
  const url = new URL(path, "http://localhost");
  const saved = {};
  const globals = {
    document,
    window: { addEventListener() {}, removeEventListener() {}, scrollTo() {}, location: url },
    // Code in `mount`/`effect` meant for a real browser (an observer, a media query) doesn't stop the build.
    __artStatic: true,
    location: url,
    history: { pushState() {}, replaceState() {} },
    fetch: () => new Promise(() => {}),
    Event: class { constructor(type) { this.type = type; } },
  };
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  try {
    await import(`${bundleUrl}?prerender=${encodeURIComponent(path)}`);
    for (let i = 0; i < 3; i++) await new Promise((ok) => setTimeout(ok, 0));
    return { html: inner(app), head: headOf(document), title: document.title };
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
}

// ---------- server rendering, per request ----------
// `serve()` renders each page request here: the app runs on this DOM with its api calls answered
// by the server itself (with the visitor's cookies), so `data` arrives already loaded. Renders run
// one at a time (the DOM lives in globals); the app module is imported once and started per request.

let appModule = null;
let queue = Promise.resolve();

// `apiFetch(path, init)`: the server's own api. Returns { html, head, title, seed, redirect }.
export function renderRequest(bundleUrl, url, base, apiFetch, timeout = 2000) {
  const job = queue.then(() => renderOnce(bundleUrl, url, base, apiFetch, timeout));
  queue = job.catch(() => {});
  return job;
}

async function renderOnce(bundleUrl, url, base, apiFetch, timeout) {
  document = new Document();
  const app = new Element("div");
  app.setAttribute("id", "app");
  document.body.appendChild(app);
  const loc = new URL(url, "http://localhost");
  const start = loc.pathname + loc.search;
  const seed = {};
  const pending = new Set();
  const fetch = (input, init = {}) => {
    const key = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const p = apiFetch(key, init).then(async (res) => {
      const text = await res.text();
      if (method === "GET") seed[key] = [res.status, text ? JSON.parse(text) : null];
      return new Response(text || null, { status: res.status, headers: { "content-type": "application/json" } });
    });
    pending.add(p);
    p.finally(() => pending.delete(p)).catch(() => {});
    return p;
  };
  const go = (_s, _t, to) => { loc.href = new URL(String(to), loc).href; };
  const globals = {
    document, location: loc, fetch, __artSSR: true,
    window: { addEventListener() {}, removeEventListener() {}, scrollTo() {}, location: loc },
    history: { pushState: go, replaceState: go },
    Event: class { constructor(type) { this.type = type; } },
  };
  const saved = {};
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  let dispose = null;
  try {
    appModule ??= await import(`${bundleUrl}?ssr`);
    dispose = appModule.start(app, base);
    // Wait until the requests the page made (and the ones their answers caused) are answered.
    const end = Date.now() + timeout;
    for (let idle = 0; idle < 3; ) {
      if (Date.now() > end) throw new Error(`server rendering ${start} took more than ${timeout} ms`);
      await new Promise((ok) => setTimeout(ok, 0));
      if (pending.size) { idle = 0; await Promise.race([Promise.allSettled([...pending]), new Promise((ok) => setTimeout(ok, 50))]); }
      else idle++;
    }
    const now = loc.pathname + loc.search;
    return { html: inner(app), head: headOf(document), title: document.title, seed, redirect: now !== start ? now : null };
  } finally {
    try { dispose?.(); } catch { /* the next render starts clean anyway */ }
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
}
