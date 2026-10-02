// Runs a generated app in a simulated browser (happy-dom) so the eval can use it like a person:
// bundle per stack, start its server for full-stack tasks, mount, click, type, read the screen.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync } from "node:zlib";
import * as esbuild from "esbuild";
import { compile } from "../../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { createApi } from "../../runtime/server.js";
import { compileVue, type Files, type Stack } from "./validate.ts";

// Solid's JSX compiles to DOM code with its Babel preset (esbuild only knows React-style JSX).
const solidJsx: esbuild.Plugin = {
  name: "solid-jsx",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const babel = await import("@babel/core");
      const src = (await import("node:fs")).readFileSync(args.path, "utf8");
      const out = await babel.transformAsync(src, {
        filename: args.path, babelrc: false, configFile: false,
        presets: [["babel-preset-solid", { generate: "dom" }], ["@babel/preset-typescript", { isTSX: true, allExtensions: true }]],
      });
      return { contents: out!.code!, loader: "js" };
    });
  },
};

const WORK = join(import.meta.dirname, ".work");

export class BehaviorError extends Error {}

// What the browser downloads: the app's JavaScript, minified, raw and brotli-compressed bytes.
export type AppSize = { raw: number; brotli: number };

// ---------- bundling ----------
// Returns the path of a single ES module that mounts the app into #app.
async function bundle(stack: Stack, files: Files, dir: string): Promise<{ path: string; size: AppSize }> {
  const write = (name: string, src: string) => { mkdirSync(join(dir, name, ".."), { recursive: true }); writeFileSync(join(dir, name), src); };
  let entry: string;
  if (stack === "artscript") {
    const r = compile(Object.entries(files).filter(([n]) => n.endsWith(".art")).map(([file, src]) => ({ file, src })));
    if (!r.js) throw new BehaviorError("no compila: " + r.diagnostics.map((d) => d.msg).join("; "));
    write("app.js", r.js);
    write("runtime.js", (await import("node:fs")).readFileSync(join(import.meta.dirname, "..", "..", "runtime", "runtime.js"), "utf8"));
    write("entry.js", 'import { start } from "./app.js";\nstart(document.getElementById("app"));\n');
    entry = "entry.js";
  } else if (stack === "react") {
    const names = Object.keys(files).filter((n) => n.endsWith(".tsx"));
    for (const n of Object.keys(files)) if (n !== "server.ts") write(n, files[n]);
    const root = names.find((n) => n === "App.tsx") ?? names.find((n) => /export\s+default/.test(files[n])) ?? names[0];
    if (!root) throw new BehaviorError("no hay un componente .tsx");
    write("entry.tsx", `import App from "./${root}";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("app")!).render(<App />);\n`);
    entry = "entry.tsx";
  } else if (stack === "vue") {
    // Each .vue becomes X.vue.ts (script setup with the template compiled inline).
    const names = Object.keys(files).filter((n) => n.endsWith(".vue"));
    for (const n of Object.keys(files)) if (!n.endsWith(".vue") && n !== "server.ts") write(n, files[n]);
    for (const n of names) {
      let js: string;
      try { js = compileVue(n, files[n]); } catch (e: any) { throw new BehaviorError(`${n} no compila: ${String(e?.message ?? e).split("\n")[0]}`); }
      write(`${n}.ts`, js.replace(/(from\s+["'][^"']+\.vue)(["'])/g, "$1.ts$2"));
    }
    const imported = (n: string) => names.some((m) => m !== n && files[m].includes(n.replace(/^.*\//, "")));
    const root = names.find((n) => n === "App.vue") ?? names.find((n) => !imported(n)) ?? names[0];
    if (!root) throw new BehaviorError("no hay un componente .vue");
    write("entry.ts", `import { createApp } from "vue";\nimport App from "./${root}.ts";\ncreateApp(App).mount("#app");\n`);
    entry = "entry.ts";
  } else if (stack === "solid") {
    const names = Object.keys(files).filter((n) => n.endsWith(".tsx"));
    for (const n of Object.keys(files)) if (n !== "server.ts") write(n, files[n]);
    const root = names.find((n) => n === "App.tsx") ?? names.find((n) => /export\s+default/.test(files[n])) ?? names[0];
    if (!root) throw new BehaviorError("no hay un componente .tsx");
    write("entry.tsx", `import { render } from "solid-js/web";\nimport App from "./${root}";\nrender(() => <App />, document.getElementById("app")!);\n`);
    entry = "entry.tsx";
  } else {
    const { compile: compileSvelte } = await import("svelte/compiler");
    const names = Object.keys(files).filter((n) => n.endsWith(".svelte"));
    // Plain modules (e.g. data.ts) are bundled as they are; server.ts runs separately.
    for (const n of Object.keys(files)) if (!n.endsWith(".svelte") && n !== "server.ts") write(n, files[n]);
    for (const n of names) {
      const js = compileSvelte(files[n], { filename: n, generate: "client" }).js.code;
      write(`${n}.js`, js.replace(/(from\s+["'][^"']+)\.svelte(["'])/g, "$1.svelte.js$2"));
    }
    const imported = (n: string) => names.some((m) => m !== n && files[m].includes(`${n.replace(/^.*\//, "")}`));
    const root = names.find((n) => n === "App.svelte") ?? names.find((n) => !imported(n)) ?? names[0];
    if (!root) throw new BehaviorError("no hay un componente .svelte");
    write("entry.js", `import { mount } from "svelte";\nimport App from "./${root}.js";\nmount(App, { target: document.getElementById("app") });\n`);
    entry = "entry.js";
  }
  try {
    const out = await esbuild.build({
      entryPoints: [join(dir, entry)], bundle: true, format: "esm", platform: "browser", write: false, jsx: "automatic",
      conditions: ["browser"], logLevel: "silent", minify: true,
      define: { "process.env.NODE_ENV": '"production"', __VUE_OPTIONS_API__: "true", __VUE_PROD_DEVTOOLS__: "false", __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false" },
      plugins: stack === "solid" ? [solidJsx] : [],
    });
    write("bundle.mjs", out.outputFiles[0].text);
    const bytes = Buffer.from(out.outputFiles[0].text);
    return { path: join(dir, "bundle.mjs"), size: { raw: bytes.length, brotli: brotliCompressSync(bytes).length } };
  } catch (e: any) {
    throw new BehaviorError("no se pudo empaquetar: " + (e.errors?.map((x: any) => x.text).join("; ") ?? String(e)));
  }
}

// Bundles an app only to measure it (no browser, no server).
export async function measureApp(stack: Stack, files: Files): Promise<AppSize> {
  mkdirSync(WORK, { recursive: true });
  const dir = mkdtempSync(join(WORK, `size-${stack}-`));
  try { return (await bundle(stack, files, dir)).size; } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---------- servers (full-stack tasks) ----------
async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

type Running = { port: number; stop: () => void };

async function startServer(stack: Stack, files: Files, dir: string): Promise<Running> {
  if (stack === "artscript") {
    const r = compile(Object.entries(files).filter(([n]) => n.endsWith(".art")).map(([file, src]) => ({ file, src })));
    if (!r.server) throw new BehaviorError("la app no declara ninguna api");
    const { fns } = await import(`data:text/javascript,${encodeURIComponent(r.server.fns)}`);
    const api = createApi(r.server, join(dir, "data"), fns);
    const server: Server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
    await new Promise<void>((r) => server.listen(0, r));
    // Open connections (a live data stream) would keep close() waiting.
    return { port: (server.address() as AddressInfo).port, stop: () => { server.closeAllConnections(); server.close(); } };
  }
  if (!files["server.ts"]) throw new BehaviorError("falta server.ts");
  try {
    const out = await esbuild.build({ stdin: { contents: files["server.ts"], loader: "ts", resolveDir: dir }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
    writeFileSync(join(dir, "server.mjs"), out.outputFiles[0].text);
  } catch (e: any) {
    throw new BehaviorError("server.ts no compila: " + (e.errors?.map((x: any) => x.text).join("; ") ?? String(e)));
  }
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [join(dir, "server.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr!.on("data", (d) => { stderr += d; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new BehaviorError(`server.ts terminó con error: ${stderr.slice(0, 300)}`);
    try { await fetch(`http://localhost:${port}/api/`); break; } catch { await new Promise((r) => setTimeout(r, 50)); }
    if (i === 99) { child.kill(); throw new BehaviorError(`server.ts no escucha en process.env.PORT. ${stderr.slice(0, 200)}`); }
  }
  return { port, stop: () => child.kill() };
}

// ---------- the page ----------
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
// What a person sees: not inside a closed <dialog>, a `hidden` element or one styled display:none.
const visible = (el: Element | null): boolean => {
  for (let e = el; e; e = e.parentElement) {
    if (e.tagName === "DIALOG" && !(e as HTMLDialogElement).open) return false;
    if ((e as HTMLElement).hidden || (e as HTMLElement).style?.display === "none") return false;
  }
  return true;
};

export class Page {
  private n = 0;
  private bundlePath: string;
  url: string;
  constructor(bundlePath: string, url: string) {
    this.bundlePath = bundlePath;
    this.url = url;
  }

  // Mounts (or re-mounts, for a "reload") the app in a fresh window, at `path` if given ("/products/2").
  async open(path?: string) {
    if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
    GlobalRegistrator.register({ url: path ? new URL(path, this.url).href : this.url });
    document.body.innerHTML = '<div id="app"></div>';
    try {
      await import(`${pathToFileURL(this.bundlePath).href}?mount=${this.n++}`);
    } catch (e: any) {
      throw new BehaviorError("la app falló al iniciar: " + String(e?.message ?? e).slice(0, 200));
    }
    await this.settle();
  }

  async settle(ms = 30) { await new Promise((r) => setTimeout(r, ms)); }

  // Visible text like a browser shows it: adjacent text nodes of the same element join directly
  // (React renders "Carrito ({count})" as three nodes), different elements are separated by a space
  // ("<h1>Directorio</h1><p>0 resultados</p>" reads "Directorio 0 resultados", not "Directorio0").
  text(): string {
    let out = "";
    let prev: Node | null = null;
    const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
    // Comments between text nodes (framework markers, e.g. Solid's) don't separate them.
    const adjacent = (a: Node, b: Node) => {
      let x = a.nextSibling;
      while (x && x !== b && x.nodeType === 8) x = x.nextSibling;
      return x === b;
    };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!visible(n.parentElement)) continue;
      out += (prev && adjacent(prev, n) ? "" : " ") + (n.textContent ?? "");
      prev = n;
    }
    return norm(out);
  }

  private buttons(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>("button, [role=button], input[type=submit], input[type=button]")].filter(visible);
  }
  private label(b: HTMLElement): string { return norm(b.textContent || (b as HTMLInputElement).value || ""); }

  button(label: string, index = 0): HTMLButtonElement {
    const all = this.buttons().filter((b) => this.label(b) === label);
    if (!all[index]) throw new BehaviorError(`no hay un botón "${label}"${index ? ` número ${index + 1}` : ""}. Botones visibles: ${this.buttons().map((b) => `"${this.label(b)}"`).join(", ") || "ninguno"}`);
    return all[index] as HTMLButtonElement;
  }
  count(label: string): number { return this.buttons().filter((b) => this.label(b) === label).length; }

  async click(label: string, index = 0) {
    this.button(label, index).click();
    await this.settle();
  }

  // An input by placeholder, by type (`type:password`) or by position (`#0`).
  input(which: string): HTMLInputElement {
    const inputs = [...document.querySelectorAll<HTMLInputElement>("input:not([type=checkbox]):not([type=submit]):not([type=button]), textarea")].filter(visible);
    const found = which.startsWith("#") ? inputs[Number(which.slice(1))]
      : which.startsWith("type:") ? inputs.find((i) => i.type === which.slice(5))
      : inputs.find((i) => i.placeholder === which);
    if (!found) throw new BehaviorError(`no hay un input ${which.startsWith("#") ? `número ${Number(which.slice(1)) + 1}` : which.startsWith("type:") ? `de tipo ${which.slice(5)}` : `con placeholder "${which}"`}. Inputs: ${inputs.map((i) => `placeholder="${i.placeholder}" type=${i.type}`).join(", ") || "ninguno"}`);
    return found;
  }

  // Types like a user: sets the value through the native setter (so React notices) and fires input/change.
  async fill(which: string, value: string) {
    const el = this.input(which);
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    await this.settle();
  }

  async press(which: string, key: string) {
    const el = this.input(which);
    const down = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    el.dispatchEvent(down);
    for (const type of ["keypress", "keyup"]) el.dispatchEvent(new window.KeyboardEvent(type, { key, bubbles: true }));
    // Like a real browser: Enter in a form field submits the form (implicit submission).
    const form = el.closest("form");
    if (key === "Enter" && form && !down.defaultPrevented) form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await this.settle();
  }

  // Picks the option with that text in the `index`-th visible <select>.
  async select(index: number, option: string) {
    const selects = [...document.querySelectorAll<HTMLSelectElement>("select")].filter(visible);
    const el = selects[index];
    if (!el) throw new BehaviorError(`no hay un selector (select) número ${index + 1} (hay ${selects.length})`);
    const opt = [...el.options].find((o) => norm(o.textContent ?? "") === option);
    if (!opt) throw new BehaviorError(`el selector no tiene la opción "${option}". Opciones: ${[...el.options].map((o) => `"${norm(o.textContent ?? "")}"`).join(", ")}`);
    // Like a browser: the option itself becomes selected. happy-dom doesn't match options with
    // `:checked` (Svelte reads the choice that way), so this select answers it as a browser would.
    for (const o of el.options) o.selected = o === opt;
    el.selectedIndex = opt.index;
    const query = el.querySelector.bind(el);
    el.querySelector = ((q: string) => (q === ":checked" ? el.options[el.selectedIndex] ?? null : query(q))) as typeof el.querySelector;
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    await this.settle();
  }

  // Clicks the `index`-th visible link with that text, like a person (a plain click event).
  async link(label: string, index = 0) {
    const all = [...document.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => visible(a) && norm(a.textContent ?? "") === label);
    if (!all[index]) throw new BehaviorError(`no hay un link "${label}"${index ? ` número ${index + 1}` : ""}`);
    all[index].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await this.settle();
  }

  path(): string { return window.location.pathname; }

  // Picks a file in the `index`-th visible file input, like choosing it in the dialog.
  async upload(index: number, name: string, content: string, type: string) {
    const inputs = [...document.querySelectorAll<HTMLInputElement>("input[type=file]")].filter(visible);
    const el = inputs[index];
    if (!el) throw new BehaviorError(`no hay un input de archivo número ${index + 1} (hay ${inputs.length})`);
    const file = new window.File([content], name, { type });
    Object.defineProperty(el, "files", { value: Object.assign([file], { item: (i: number) => [file][i] ?? null }), configurable: true });
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    await this.settle();
  }

  // The src of every visible image.
  images(): string[] { return [...document.querySelectorAll<HTMLImageElement>("img")].filter(visible).map((i) => i.getAttribute("src") ?? ""); }

  async check(index: number) {
    const boxes = [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    if (!boxes[index]) throw new BehaviorError(`no hay un checkbox número ${index + 1} (hay ${boxes.length})`);
    boxes[index].click();
    await this.settle();
  }

  // Waits until `cond` holds; on timeout fails with `expected` and what the screen shows.
  async until(cond: () => boolean, expected: string, ms = 2500) {
    const end = Date.now() + ms;
    for (;;) {
      let ok = false;
      try { ok = cond(); } catch { ok = false; }
      if (ok) return;
      if (Date.now() > end) throw new BehaviorError(`se esperaba ${expected}. La pantalla muestra: "${this.text().slice(0, 300)}"`);
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}

// Builds and mounts an app; the caller must call close(). It installs global DOM state, so each
// check runs in its own process (see behave() in behavior.ts).
export async function launch(stack: Stack, files: Files, fullstack: boolean): Promise<{ page: Page; close: () => Promise<void>; size: AppSize }> {
  mkdirSync(WORK, { recursive: true });
  const dir = mkdtempSync(join(WORK, `app-${stack}-`));
  let server: Running | null = null;
  const close = async () => {
    server?.stop();
    if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    const { path, size } = await bundle(stack, files, dir);
    if (fullstack) server = await startServer(stack, files, dir);
    const page = new Page(path, `http://localhost:${server?.port ?? 3999}/`);
    await page.open();
    return { page, close, size };
  } catch (e) {
    await close();
    throw e;
  }
}
