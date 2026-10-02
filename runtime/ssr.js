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

class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.style = {};
    this.value = "";
    this.selectedIndex = -1;
    const el = this;
    this.classList = {
      add(c) { const s = new Set(el.className.split(" ").filter(Boolean)); s.add(c); el.className = [...s].join(" "); },
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
  html() {
    const tag = this.tagName.toLowerCase();
    const attrs = [...this.attrs];
    const css = Object.entries(this.style).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${kebab(k)}:${v}`).join(";");
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
    const inner = (el) => el.childNodes.map((c) => c.html()).join("");
    return { html: inner(app), head: inner(document.head), title: document.title };
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
}
