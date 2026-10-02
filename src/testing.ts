// `art test`: runs the `test "..." { ... }` blocks of a project in a simulated browser (happy-dom,
// an optional dependency) against a real server when the app has apis. Each test starts from a
// fresh database. Steps use what a person sees: texts, buttons, placeholders, labels, links.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Expr, Program, Stmt, TestDecl } from "./ast.ts";
import { compile, type Source } from "./compile.ts";

export class StepError extends Error {}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
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
  open: "s?", see: "s", notSee: "s", click: "sn?", link: "sn?", fill: "ss", press: "ss", select: "ns", check: "n",
};

// Each mount imports the bundle under a new URL, so the app runs again from scratch.
let mounts = 0;

class Page {
  bundle: string;
  url: string;
  reg: any;
  constructor(bundle: string, url: string, reg: any) {
    this.bundle = bundle;
    this.url = url;
    this.reg = reg;
  }

  async open(path?: string) {
    if (this.reg.isRegistered) await this.reg.unregister();
    this.reg.register({ url: path ? new URL(path, this.url).href : this.url });
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
    // By its text, or by its accessible name when it has no text (an icon button).
    const b = this.buttons().filter((x) => (norm(x.textContent ?? "") || x.getAttribute("aria-label") || x.querySelector("[aria-label]")?.getAttribute("aria-label")) === label)[index];
    if (!b) throw new StepError(`no button "${label}"${index ? ` #${index + 1}` : ""}; buttons: ${this.buttons().map((x) => `"${norm(x.textContent ?? "")}"`).join(", ") || "none"}`);
    b.click();
    await this.settle();
  }
  async link(label: string, index = 0) {
    const a = [...document.querySelectorAll<HTMLAnchorElement>("a")].filter((x) => visible(x) && norm(x.textContent ?? "") === label)[index];
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

const literal = (e: Expr): string | number => (e.kind === "Str" || e.kind === "Num" ? e.value : NaN);

async function run(page: Page, steps: Stmt[]) {
  for (const s of steps) {
    if (s.kind !== "ExprStmt" || s.expr.kind !== "Call" || s.expr.callee.kind !== "Ident") continue;
    const [a, b] = s.expr.args.map(literal) as [any, any];
    const step = s.expr.callee.name;
    try {
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

export async function runTests(sources: Source[]): Promise<TestResult[] | { diagnostics: string[] }> {
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
  for (const t of tests) {
    // A fresh server and database per test.
    let server: Server | null = null;
    let url = "http://localhost:3999/";
    if (r.server) {
      const api = createApi(r.server, mkdtempSync(join(dir, "data-")), fns.fns);
      server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
      await new Promise<void>((ok) => server!.listen(0, ok));
      url = `http://localhost:${(server.address() as AddressInfo).port}/`;
    }
    const page = new Page(bundle, url, reg);
    try {
      await page.open();
      await run(page, t.body);
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: (e as Error).message });
    } finally {
      // Let pending requests and updates finish first: they can't run once the DOM is gone.
      const win = (globalThis as any).window;
      if (reg.isRegistered) await Promise.race([win?.happyDOM?.waitUntilComplete?.(), new Promise((r) => setTimeout(r, 1000))]);
      if (reg.isRegistered) await reg.unregister();
      server?.closeAllConnections();
      server?.close();
    }
  }
  rmSync(dir, { recursive: true, force: true });
  return results;
}
