// Minimal in-memory DOM for end-to-end tests (no dependencies like jsdom).
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "../src/compile.ts";

class FNode {
  childNodes: FNode[] = [];
  parentNode: FNode | null = null;
  isFrag = false;
  get nextSibling(): FNode | null {
    const list = this.parentNode?.childNodes;
    return list?.[list.indexOf(this) + 1] ?? null;
  }
  get firstChild(): FNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): FNode | null { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nodeType(): number { return this instanceof FElement ? 1 : this instanceof FText ? 3 : this instanceof FComment ? 8 : 11; }
  appendChild(n: FNode): FNode {
    return this.insertBefore(n, null);
  }
  insertBefore(n: FNode, ref: FNode | null): FNode {
    const list = n.isFrag ? [...n.childNodes] : [n];
    for (const c of list) {
      c.parentNode?.removeChild(c);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
      c.parentNode = this;
    }
    return n;
  }
  removeChild(n: FNode): FNode {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = v ? [new FText(v)] : [];
  }
}

class FText extends FNode {
  data: string;
  constructor(d: string) {
    super();
    this.data = d;
  }
  get textContent() { return this.data; }
  set textContent(v: string) { this.data = v; }
}

class FComment extends FNode {
  get textContent() { return ""; }
  set textContent(_v: string) {}
}

export class FElement extends FNode {
  tagName: string;
  className = "";
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  value = "";
  checked = false;
  type = "";
  placeholder = "";
  disabled = false;
  href = "";
  src = "";
  alt = "";
  id = "";
  classList = {
    toggle: (c: string, on: boolean) => {
      const set = new Set(this.className.split(" ").filter(Boolean));
      if (on) set.add(c); else set.delete(c);
      this.className = [...set].join(" ");
    },
  };
  constructor(tag: string) {
    super();
    this.tagName = tag;
  }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener(t: string, f: (e: unknown) => void) { (this.listeners[t] ??= []).push(f); }
  dispatch(t: string, extra: Record<string, unknown> = {}) {
    for (const f of this.listeners[t] ?? []) f({ type: t, preventDefault() {}, ...extra });
  }
  // Test helpers
  click() { this.dispatch("click"); }
  typeText(v: string) { this.value = v; this.dispatch("input"); }
  toggle() { this.checked = !this.checked; this.dispatch("change"); }
  pressEnter() { this.dispatch("keydown", { key: "Enter" }); }
  submit() { this.dispatch("submit"); }
}

export function installDom() {
  const g = globalThis as any;
  g.document = {
    head: new FElement("head"),
    createElement: (t: string) => new FElement(t),
    createTextNode: (d: string) => new FText(d),
    createComment: () => new FComment(),
    createDocumentFragment: () => Object.assign(new FNode(), { isFrag: true }),
    getElementById: () => null,
  };
}

export function all(n: FNode, tag?: string): FElement[] {
  const out: FElement[] = [];
  for (const c of n.childNodes) {
    if (c instanceof FElement && (!tag || c.tagName === tag)) out.push(c);
    out.push(...all(c, tag));
  }
  return out;
}

// Compiles, writes app.js + runtime.js to a temp dir and mounts the first page.
// `setup` runs against the runtime module before mounting (e.g. to point the api client at a test server).
export async function mountApp(src: string, setup?: (rt: any) => void) {
  installDom();
  const r = compile([{ file: "test.art", src }]);
  if (!r.js) throw new Error("compile errors: " + JSON.stringify(r.diagnostics));
  const dir = mkdtempSync(join(tmpdir(), "art-"));
  writeFileSync(join(dir, "app.js"), r.js);
  copyFileSync(new URL("../runtime/runtime.js", import.meta.url), join(dir, "runtime.js"));
  const app = await import(pathToFileURL(join(dir, "app.js")).href);
  const rt = await import(pathToFileURL(join(dir, "runtime.js")).href);
  setup?.(rt);
  const root = new FElement("div");
  const dispose = rt.root(() => app.routes[0].comp({}, root));
  return { root, dispose, js: r.js, rt };
}
