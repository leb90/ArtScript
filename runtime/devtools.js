// ArtScript dev tools: only `art dev` builds load this file (production bundles never do).
// A panel (Alt+A, or the badge at the bottom right) lists every mounted component with its props,
// states, computed and data, live; a state's value can be edited; what an update writes to the
// page flashes. `__art.snapshot()` returns the same data as plain objects, for the console or an
// agent driving the browser.
import { effect, onDispose } from "./runtime.js";

const components = new Set(); // { name, members: Map(name → { kind, get, set, value, changed }) }
let host = null, body = null, open = false, queued = false, observer = null;

// Called at the top of every component (the compiler adds it in dev builds).
// `members`: { name: [kind, get, set?] }.
export function $inspect(name, members) {
  if (typeof document === "undefined" || globalThis.__artSSR) return;
  const c = { name, members: new Map() };
  for (const [key, [kind, get, set]] of Object.entries(members)) {
    const m = { kind, get, set, value: undefined, changed: 0 };
    c.members.set(key, m);
    // Reading it here subscribes: the panel refreshes when it changes (also in place).
    let first = true;
    effect(() => {
      try { m.value = get(); } catch (e) { m.value = e; }
      if (!first) m.changed = Date.now();
      first = false;
      schedule();
    });
  }
  components.add(c);
  onDispose(() => { components.delete(c); schedule(); });
  schedule();
  setup();
}

const plain = (v) => {
  if (typeof v === "function") return "fn";
  if (v instanceof Error) return `error: ${v.message}`;
  if (typeof Node !== "undefined" && v instanceof Node) return `<${v.nodeName.toLowerCase()}>`;
  return v;
};
const show = (v) => {
  v = plain(v);
  if (v === undefined) return "undefined";
  let s;
  try { s = JSON.stringify(v, (_, x) => (typeof x === "function" ? "fn" : x)); } catch { s = String(v); }
  return s.length > 120 ? s.slice(0, 117) + "..." : s;
};

function snapshot() {
  return [...components].map((c) => ({ component: c.name, ...Object.fromEntries([...c.members].map(([k, m]) => [k, plain(m.value)])) }));
}

function schedule() {
  if (!open || queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; paint(); });
}

const CSS = `:host{all:initial;position:fixed;right:12px;bottom:12px;z-index:99998;font:12px/1.5 ui-monospace,Menlo,monospace;color:#e5e5e5}
button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.badge{background:#171717;border:1px solid #404040;border-radius:999px;padding:4px 10px;box-shadow:0 2px 8px #0006}
.panel{width:380px;max-width:calc(100vw - 24px);max-height:60vh;overflow:auto;background:#171717;border:1px solid #404040;border-radius:8px;box-shadow:0 8px 24px #0008}
.head{display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #404040;position:sticky;top:0;background:#171717}
.comp{padding:6px 10px;border-bottom:1px solid #262626}
.name{color:#93c5fd;font-weight:600}
.count{color:#a3a3a3}
.row{display:flex;gap:8px;padding-left:10px;white-space:nowrap}
.kind{color:#a3a3a3;width:64px;flex:none}
.key{color:#fcd34d;flex:none}
.val{color:#e5e5e5;overflow:hidden;text-overflow:ellipsis;text-align:left}
button.val:hover{text-decoration:underline}
.new{background:#14532d}
.empty{padding:10px;color:#a3a3a3}`;

function setup() {
  if (host) return;
  host = document.createElement("div");
  host.id = "__art_devtools";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  body = document.createElement("div");
  shadow.append(style, body);
  document.body.appendChild(host);
  globalThis.__art = { snapshot, toggle };
  document.addEventListener("keydown", (e) => { if (e.altKey && e.code === "KeyA") { e.preventDefault(); toggle(); } });
  try { open = sessionStorage.getItem("art-devtools") === "1"; } catch { /* no storage */ }
  watch();
  paint();
}

function toggle() {
  open = !open;
  try { sessionStorage.setItem("art-devtools", open ? "1" : "0"); } catch { /* no storage */ }
  watch();
  paint();
}

// While the panel is open, whatever an update writes to the page flashes.
function watch() {
  observer?.disconnect();
  observer = null;
  if (!open || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver((list) => {
    const seen = new Set();
    for (const m of list) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!el || el === host || seen.has(el) || !el.animate) continue;
      seen.add(el);
      el.animate([{ outline: "2px solid #d946ef", outlineOffset: "1px" }, { outline: "2px solid transparent", outlineOffset: "1px" }], 500);
    }
  });
  observer.observe(document.getElementById("app") ?? document.body, { subtree: true, childList: true, characterData: true, attributes: true });
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function paint() {
  body.textContent = "";
  if (!open) {
    const b = el("button", "badge", "◆ art");
    b.title = "ArtScript dev tools (Alt+A)";
    b.onclick = toggle;
    body.appendChild(b);
    return;
  }
  const panel = el("div", "panel");
  const head = el("div", "head");
  head.append(el("span", "name", "ArtScript dev tools"));
  const close = el("button", null, "close (Alt+A)");
  close.onclick = toggle;
  head.appendChild(close);
  panel.appendChild(head);
  // Instances of one component (the rows of a list) are grouped; the first few are shown.
  const groups = new Map();
  for (const c of components) groups.has(c.name) ? groups.get(c.name).push(c) : groups.set(c.name, [c]);
  if (!groups.size) panel.appendChild(el("div", "empty", "No components mounted."));
  const now = Date.now();
  for (const [name, list] of groups) {
    list.slice(0, 5).forEach((c, i) => {
      const box = el("div", "comp");
      const title = el("div");
      title.append(el("span", "name", name), el("span", "count", list.length > 1 ? ` ${i + 1} of ${list.length}` : ""));
      box.appendChild(title);
      for (const [key, m] of c.members) {
        const row = el("div", "row" + (now - m.changed < 1000 ? " new" : ""));
        row.append(el("span", "kind", m.kind), el("span", "key", key));
        const val = el(m.set ? "button" : "span", "val", show(m.value));
        if (m.set) {
          val.title = "Click to change it";
          val.onclick = () => {
            const text = prompt(`${name}.${key} =`, JSON.stringify(plain(m.value)));
            if (text == null) return;
            try { m.set(JSON.parse(text)); } catch (e) { alert(`Not valid JSON: ${e.message}`); }
          };
        }
        row.appendChild(val);
        box.appendChild(row);
      }
      panel.appendChild(box);
    });
  }
  body.appendChild(panel);
  // The "changed" highlight fades on the next paint.
  if ([...components].some((c) => [...c.members.values()].some((m) => now - m.changed < 1000))) setTimeout(schedule, 1000);
}
