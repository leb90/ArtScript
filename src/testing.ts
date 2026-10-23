// `art test`: runs the `test "..." { ... }` blocks of a project in a simulated browser (happy-dom,
// an optional dependency) against a real server when the app has apis. Each test starts from a
// fresh database. Steps use what a person sees: texts, buttons, placeholders, labels, links.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Expr, Program, Stmt, TestDecl } from "./ast.ts";
import { compile, type Source } from "./compile.ts";

export class StepError extends Error {}

const norm = (s: string) => s.replace(/\s+/g, " ").trim(); // \s covers the no-break space
const visible = (el: Element | null): boolean => {
  for (let e = el; e; e = e.parentElement) {
    if (e.tagName === "DIALOG" && !(e as HTMLDialogElement).open) return false;
    // `aria-hidden` too: what a screen reader skips, a test doesn't see (a closed panel, decoration).
    if ((e as HTMLElement).hidden || (e as HTMLElement).style?.display === "none" || e.getAttribute("aria-hidden") === "true") return false;
  }
  return true;
};

// What a test step can do, with its argument types (s: string, n: number; `?` optional).
export const STEPS: Record<string, string> = {
  open: "s?", see: "s", notSee: "s", click: "sn?", link: "sn?", fill: "ss", press: "ss", select: "ns", check: "n", respond: "sn?o",
};

// `respond "https://api.example.com/*" 200 { "ok": true }`: what a request to another origin gets
// in this test. Without one, such a request fails (a test never reaches a real service: a form
// that emails would send mail on every run).
type Stub = { re: RegExp; status: number; body: unknown };
const glob = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
function guardFetch(stubs: Stub[]) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href);
    const stub = stubs.find((s) => s.re.test(url.href));
    if (stub) return new Response(JSON.stringify(stub.body), { status: stub.status, headers: { "content-type": "application/json" } });
    if (url.origin !== location.origin) {
      throw new TypeError(`art test: the page requested ${url.href}, and a test doesn't reach other sites: add \`respond "${url.origin}/*" 200 { }\` before the step that sends it`);
    }
    return real(input, init);
  }) as typeof fetch;
}

// Each mount imports the bundle under a new URL, so the app runs again from scratch.
let mounts = 0;

// A request art test stops (the page is left or the test ends) fails with this: as in a browser
// leaving a page, it's neither the page's error nor worth printing.
const stopped = (e: unknown) => /The operation was aborted/.test(String((e as Error)?.message ?? e));

// Leaves the current page: what's still running stops while the DOM is there (once it's gone,
// its code would fail), then the page goes.
async function leave(reg: any) {
  if (!reg.isRegistered) return;
  await (globalThis as any).happyDOM?.abort?.();
  await reg.unregister();
}

class Page {
  bundle: string;
  url: string;
  reg: any;
  constructor(bundle: string, url: string, reg: any) {
    this.bundle = bundle;
    this.url = url;
    this.reg = reg;
  }

  stubs: Stub[] = [];
  async open(path?: string) {
    await leave(this.reg);
    this.reg.register({ url: path ? new URL(path, this.url).href : this.url });
    guardFetch(this.stubs);
    document.body.innerHTML = '<div id="app"></div>';
    await import(`${pathToFileURL(this.bundle).href}?run=${mounts++}`);
    await this.settle();
  }
  settle(ms = 30) { return new Promise((r) => setTimeout(r, ms)); }
  text(): string {
    const walker = document.createTreeWalker(document.body, 4);
    let out = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (visible(n.parentElement)) out += " " + n.textContent;
    return norm(out);
  }
  private buttons() { return [...document.querySelectorAll<HTMLElement>("button, [role=button], [role=tab]")].filter(visible); }
  async click(label: string, index = 0) {
    // By its text or by its accessible name (aria-label, also on an icon inside): a button whose
    // text changes can be found by a fixed aria-label.
    const aria = (x: HTMLElement) => x.getAttribute("aria-label") ?? x.querySelector("[aria-label]")?.getAttribute("aria-label") ?? null;
    const b = this.buttons().filter((x) => norm(x.textContent ?? "") === label || aria(x) === label)[index];
    const names = this.buttons().map((x) => `"${norm(x.textContent ?? "")}"${aria(x) ? ` (aria-label "${aria(x)}")` : ""}`);
    if (!b) throw new StepError(`no button "${label}"${index ? ` #${index + 1}` : ""}; buttons: ${names.join(", ") || "none"}`);
    b.click();
    await this.settle();
  }
  async link(label: string, index = 0) {
    const a = [...document.querySelectorAll<HTMLAnchorElement>("a")].filter((x) => visible(x) && (norm(x.textContent ?? "") === label || x.getAttribute("aria-label") === label))[index];
    if (!a) throw new StepError(`no link "${label}"`);
    a.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await this.settle();
  }
  private input(placeholder: string): HTMLInputElement {
    const all = [...document.querySelectorAll<HTMLInputElement>("input, textarea")].filter(visible);
    // By placeholder, or by the visible label (`input email label="Email"`).
    const label = (i: HTMLElement) => norm(i.closest("label")?.textContent ?? "");
    const el = all.find((i) => i.placeholder === placeholder) ?? all.find((i) => label(i) === placeholder);
    if (!el) throw new StepError(`no input with placeholder or label "${placeholder}"; inputs: ${all.map((i) => `"${i.placeholder || label(i)}"`).join(", ") || "none"}`);
    return el;
  }
  async fill(placeholder: string, value: string) {
    const el = this.input(placeholder);
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    await this.settle();
  }
  async press(placeholder: string, key: string) {
    this.input(placeholder).dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await this.settle();
  }
  async select(index: number, option: string) {
    const el = [...document.querySelectorAll<HTMLSelectElement>("select")].filter(visible)[index];
    const opt = el && [...el.options].find((o) => norm(o.textContent ?? "") === option);
    if (!opt) throw new StepError(el ? `the select has no option "${option}"` : `no select #${index + 1}`);
    for (const o of el.options) o.selected = o === opt;
    el.selectedIndex = opt.index;
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    await this.settle();
  }
  async check(index: number) {
    const box = [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter(visible)[index];
    if (!box) throw new StepError(`no checkbox #${index + 1}`);
    box.click();
    await this.settle();
  }
  async until(cond: () => boolean, expected: string, ms = 5000) {
    for (const end = Date.now() + ms; !cond(); await new Promise((r) => setTimeout(r, 15))) {
      if (Date.now() > end) throw new StepError(`expected ${expected}; the screen shows: "${this.text().slice(0, 600)}"`);
    }
  }
}

// A step's argument as a value (a JSON body is an object or list literal).
const literal = (e: Expr): any => {
  if (e.kind === "Str" || e.kind === "Num" || e.kind === "Bool") return e.value;
  if (e.kind === "Null") return null;
  if (e.kind === "Unary" && e.op === "-") return -literal(e.arg);
  if (e.kind === "Array") return e.items.map(literal);
  if (e.kind === "Object") return Object.fromEntries(e.props.flatMap((p) => ("key" in p ? [[p.key, literal(p.value)]] : [])));
  return NaN;
};

async function run(page: Page, steps: Stmt[]) {
  for (const s of steps) {
    if (s.kind !== "ExprStmt" || s.expr.kind !== "Call" || s.expr.callee.kind !== "Ident") continue;
    const args = s.expr.args.map(literal);
    const step = s.expr.callee.name;
    // Labels and texts are compared as the screen reads them: a no-break space (`Intl` writes one in
    // "10 €") is a space on both sides.
    const [a, b] = step === "fill" || step === "press" || step === "open" || step === "respond" ? args : [typeof args[0] === "string" ? norm(args[0]) : args[0], typeof args[1] === "string" ? norm(args[1]) : args[1]];
    try {
      if (step === "respond") {
        const status = typeof args[1] === "number" ? args[1] : 200;
        const body = typeof args[1] === "number" ? args[2] : args[1];
        page.stubs.push({ re: glob(String(args[0])), status, body: body ?? {} });
        continue;
      }
      if (step === "open") await page.open(a);
      else if (step === "see") await page.until(() => page.text().includes(a), `"${a}"`);
      else if (step === "notSee") await page.until(() => !page.text().includes(a), `no "${a}"`);
      else {
        // What the step acts on may still be loading: it's retried for a moment, as `see` waits.
        for (const end = Date.now() + 2000; ; await new Promise((r) => setTimeout(r, 25))) {
          try { await (page as any)[step](a, b); break; } catch (e) { if (!(e instanceof StepError) || Date.now() > end) throw e; }
        }
      }
    } catch (e) {
      throw new StepError(`line ${s.loc.line}: ${step}: ${(e as Error).message}`);
    }
  }
}

export type TestResult = { name: string; ok: boolean; error?: string };

// `api`: the app's own server (`art test --api http://localhost:8787`): the page's `/api/...`
// requests go there, from the page's own origin so its cookies work, and the tests see that
// server's answers. `reset`: a path of it that gets a POST before each test (a clean database).
export type TestOptions = { api?: string; reset?: string };

// Forwards a request to `target` as is (method, headers, body) and its answer back. The Host stays
// the page's, so the server's same-site checks (Origin or Referer against Host) see one site.
function forward(req: IncomingMessage, res: ServerResponse, target: string) {
  const url = new URL(req.url ?? "/", target);
  const out = httpRequest(url, { method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  out.on("error", (e) => res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ message: `art test --api: can't reach ${target} (${e.message})` })));
  req.pipe(out);
}

function post(url: URL): Promise<number> {
  return new Promise((ok, fail) => {
    const r = httpRequest(url, { method: "POST", headers: { "content-type": "application/json", "content-length": 2 } }, (res) => { res.resume(); ok(res.statusCode ?? 0); });
    r.on("error", fail);
    r.end("{}");
  });
}

export async function runTests(sources: Source[], options: TestOptions = {}): Promise<TestResult[] | { diagnostics: string[] }> {
  const r = compile(sources);
  if (!r.js) return { diagnostics: r.diagnostics.map((d) => `${d.loc.file}:${d.loc.line}:${d.loc.col} ${d.type}: ${d.msg}`) };
  const tests = (r.program as Program).decls.filter((d): d is TestDecl => d.kind === "Test");
  let reg: any;
  try { reg = (await import("@happy-dom/global-registrator")).GlobalRegistrator; } catch {
    return { diagnostics: ["art test needs happy-dom: npm install --save-dev @happy-dom/global-registrator"] };
  }
  const esbuild = await import("esbuild");
  const dir = mkdtempSync(join(tmpdir(), "art-test-"));
  const runtime = new URL("../runtime/runtime.js", import.meta.url).pathname;
  const out = await esbuild.build({
    stdin: { contents: r.js.replace('"./runtime.js"', JSON.stringify(runtime)) + "\nstart();\n", resolveDir: process.cwd(), loader: "js" },
    bundle: true, format: "esm", platform: "browser", write: false, logLevel: "silent",
  });
  const bundle = join(dir, "app.js");
  writeFileSync(bundle, out.outputFiles[0].text);
  const { createApi } = await import(new URL("../runtime/server.js", import.meta.url).href);
  // Next to the project, so the `use` imports of server fns resolve as they do in `art dev`.
  let fns: any = null;
  if (r.server) {
    const file = join(process.cwd(), ".art", `test-fns-${Date.now()}.mjs`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, r.server.fns);
    try { fns = await import(pathToFileURL(file).href); } finally { rmSync(file, { force: true }); }
  }
  const results: TestResult[] = [];
  // What the page throws without catching it (a failed request in an event handler) fails the test
  // it happens in; once that test is over, its page's late errors are ignored, not a crash.
  let thrown: string[] | null = null;
  const onError = (e: unknown) => void (stopped(e) || thrown?.push((e as Error)?.message ?? String(e)));
  process.on("unhandledRejection", onError);
  process.on("uncaughtException", onError);
  // happy-dom prints every request it stops; the page shares this console.
  const error = console.error;
  console.error = (...args: unknown[]) => void (stopped(args[0]) || error.apply(console, args));
  try {
    for (const t of tests) results.push(await runOne(t));
  } finally {
    await new Promise((r) => setImmediate(r)); // the last page's aborted requests settle here
    process.off("unhandledRejection", onError);
    process.off("uncaughtException", onError);
    console.error = error;
    rmSync(dir, { recursive: true, force: true });
  }
  return results;

  async function runOne(t: TestDecl): Promise<TestResult> {
    // A fresh server and database per test (or the app's own server, reset first when asked).
    let server: Server | null = null;
    let url = "http://localhost:3999/";
    let setup: string | null = null; // why the test can't start
    if (options.api) {
      const target = options.api;
      if (options.reset) {
        try {
          const status = await post(new URL(options.reset, target));
          if (status >= 300) setup = `art test --reset: POST ${options.reset} answered ${status}`;
        } catch (e) {
          setup = `art test --reset: can't reach ${target} (${(e as Error).message})`;
        }
      }
      server = createServer((req, res) => {
        if ((req.url ?? "").startsWith("/api/")) forward(req, res, target);
        else res.writeHead(404).end();
      });
      await new Promise<void>((ok) => server!.listen(0, ok));
      url = `http://localhost:${(server.address() as AddressInfo).port}/`;
    } else if (r.server) {
      const api = createApi(r.server, mkdtempSync(join(dir, "data-")), fns.fns);
      server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
      await new Promise<void>((ok) => server!.listen(0, ok));
      url = `http://localhost:${(server.address() as AddressInfo).port}/`;
    }
    const page = new Page(bundle, url, reg);
    let error: string | null = null;
    thrown = [];
    try {
      try {
        if (setup) throw new Error(setup);
        await page.open();
        await run(page, t.body);
      } catch (e) {
        error = (e as Error).message;
      }
      // Pending requests and updates get a second to finish; what they throw still counts.
      const win = (globalThis as any).window;
      if (reg.isRegistered) await Promise.race([win?.happyDOM?.waitUntilComplete?.(), new Promise((r) => setTimeout(r, 1000))]);
      await new Promise((r) => setImmediate(r));
      const first = thrown[0];
      if (first !== undefined) error = error ? `${error} (the page threw: ${first})` : `the page threw: ${first}`;
      return error ? { name: t.name, ok: false, error } : { name: t.name, ok: true };
    } finally {
      thrown = null;
      await leave(reg);
      server?.closeAllConnections();
      server?.close();
    }
  }
}
