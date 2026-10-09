// Markdown → HTML for the docs pages, with ArtScript syntax highlighting. Returns strings (no DOM),
// so the same output is prerendered at build time and set live in the browser.
import { ELEMENTS } from "../../src/elements.ts";
// @ts-ignore: runtime is plain JS
import { withBase } from "../../runtime/runtime.js";

export const REPO = "https://github.com/leb90/ArtScript";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- highlighting ----------
const KEYWORDS = new Set([
  "page", "component", "layout", "model", "api", "state", "computed", "fn", "data", "use", "auth", "server", "job", "every",
  "test", "if", "else", "for", "in", "key", "mount", "effect", "cleanup", "ref", "meta", "slot", "requires", "return", "let",
  "try", "catch", "await", "live", "private", "login", "admin", "with", "as", "style", "cascade", "unique", "was",
  "replace", "insert", "before", "after", "append", "remove", "set", "add",
]);
const JS_KEYWORDS = new Set(["const", "let", "var", "function", "return", "import", "export", "from", "if", "else", "for", "of", "in", "new", "await", "async", "class", "extends", "true", "false", "null", "undefined", "typeof", "default", "type", "interface"]);
const ELEMENT_NAMES = new Set([...Object.keys(ELEMENTS), "title", "text"]);

// Comments are `#` in shell snippets and `//` everywhere else (so URLs in commands stay URLs).
const REST = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(->|=>)|([A-Za-z_$][\w$-]*)(=?)/.source;
const SHELL_COMMENT = /(?<![\w:\/])#[^\n]*/.source;
const LINE_COMMENT = /\/\/[^\n]*/.source;
const TOKEN = (shell: boolean) => new RegExp(`(${shell ? SHELL_COMMENT : LINE_COMMENT})|${REST}`, "g");

export function highlight(code: string, lang = "art"): string {
  const art = lang === "art" || lang === "patch" || lang === "";
  const shell = lang === "sh" || lang === "bash" || lang === "shell";
  let out = "", last = 0;
  for (const m of code.matchAll(TOKEN(shell))) {
    const [all, comment, str, num, arrow, word, eq] = m;
    out += esc(code.slice(last, m.index));
    last = m.index! + all.length;
    if (comment) out += `<span class="hl-c">${esc(comment)}</span>`;
    else if (str) out += `<span class="hl-s">${esc(str)}</span>`;
    else if (num) out += `<span class="hl-n">${num}</span>`;
    else if (arrow) out += `<span class="hl-o">${esc(arrow)}</span>`;
    else if (word) {
      let cls = "";
      if (eq) cls = art ? "hl-p" : "";
      else if (art && KEYWORDS.has(word)) cls = "hl-k";
      else if (art && ELEMENT_NAMES.has(word)) cls = "hl-e";
      else if (!art && JS_KEYWORDS.has(word)) cls = "hl-k";
      else if (/^[A-Z]/.test(word)) cls = "hl-t";
      else if (shell && /^(npm|npx|node|art|cd|claude|git|docker|fly)$/.test(word)) cls = "hl-k";
      out += cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word);
      if (eq) out += "=";
    }
  }
  return out + esc(code.slice(last));
}

export function codeBlock(code: string, lang = "art"): string {
  const label = lang === "art" ? "ArtScript" : lang === "patch" ? "art patch" : lang || "text";
  return `<div class="code"><div class="code-bar"><span>${esc(label)}</span><button class="copy" type="button" data-copy>Copy</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;
}

// ---------- links ----------
// Repository files that are pages of this site.
const SITE_LINKS: Record<string, string> = {
  "docs/SPEC.md": "/reference/spec",
  "SPEC.md": "/reference/spec",
  "docs/SPEC-EDIT.md": "/reference/edit",
  "docs/SPEC-CORE.md": "/reference/core",
  "SPEC-CORE.md": "/reference/core",
  "SPEC-EDIT.md": "/reference/edit",
  "docs/DEPLOY.md": "/learn/deploy",
  "DEPLOY.md": "/learn/deploy",
  "SECURITY.md": "/reference/security",
  "docs/STATUS.md": "/status",
  "#cost-eval-results": "/benchmarks",
};

export function href(url: string): string {
  if (SITE_LINKS[url]) return withBase(SITE_LINKS[url]);
  if (/^(https?:|mailto:|#)/.test(url)) return url;
  if (url.startsWith("/")) return withBase(url);
  // Any other relative path is a file of the repository.
  const path = url.replace(/^\.?\//, "").replace(/^(\.\.\/)+/, "");
  return `${REPO}/${/\.\w+$/.test(path) ? "blob" : "tree"}/main/${path}`;
}

function inline(s: string): string {
  const codes: string[] = [];
  s = s.replace(/``\s?(.+?)\s?``|`([^`]+)`/g, (_, a, b) => `\u0000${codes.push(a ?? b) - 1}\u0000`);
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
      const to = href(u.replace(/&amp;/g, "&"));
      const ext = /^https?:/.test(to) ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${to}"${ext}>${t}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

// ---------- blocks ----------
export type Heading = { level: number; text: string; id: string };

export function markdown(md: string, opts: { skipTitle?: boolean } = {}): string {
  const out: string[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = /^(\s*)```+\s*(\w*)/.exec(l);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i].slice(fence[1].length));
      if (fence[2] !== "mermaid") out.push(codeBlock(body.join("\n"), fence[2]));
      continue;
    }
    const h = /^(#{1,4}) (.*)$/.exec(l);
    if (h) {
      flush();
      const level = h[1].length;
      if (level === 1 && opts.skipTitle) continue;
      const id = slug(h[2]);
      out.push(`<h${level} id="${id}">${inline(h[2])}${level > 1 ? ` <a class="anchor" href="#${id}" aria-label="Link to this section">#</a>` : ""}</h${level}>`);
      continue;
    }
    if (/^\|/.test(l)) {
      flush();
      const rows: string[] = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) if (!/^\|[-:| ]+\|$/.test(lines[i])) rows.push(lines[i]);
      i--;
      const cells = (r: string) => r.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      out.push(`<div class="table"><table><thead><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.) (.*)$/.exec(l);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = /^(\s*)([-*]|\d+\.) (.*)$/.exec(lines[i]);
        if (m) items.push(m[3]);
        else if (/^\s{2,}\S/.test(lines[i]) && items.length && !/^\s*```/.test(lines[i])) items[items.length - 1] += " " + lines[i].trim();
        else break;
      }
      i--;
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (/^> /.test(l)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) quote.push(lines[i].replace(/^> ?/, ""));
      i--;
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      continue;
    }
    if (/^\s*</.test(l) || /^-{3,}$/.test(l.trim())) { flush(); continue; } // raw HTML (details, comments) and rules
    if (!l.trim()) { flush(); continue; }
    para.push(l.trim());
  }
  flush();
  return out.join("\n");
}

export function headings(md: string): Heading[] {
  const hs: Heading[] = [];
  let inFence = false;
  for (const l of md.split("\n")) {
    if (/^\s*```/.test(l)) inFence = !inFence;
    const h = !inFence && /^(#{2,3}) (.*)$/.exec(l);
    if (h) hs.push({ level: h[1].length, text: h[2].replace(/`/g, ""), id: slug(h[2]) });
  }
  return hs;
}

// Copy buttons inside rendered Markdown: one listener on the container.
export function onDocClick(event: MouseEvent) {
  const btn = (event.target as HTMLElement).closest?.("[data-copy]") as HTMLElement | null;
  if (!btn) return;
  const code = btn.closest(".code")?.querySelector("pre")?.textContent ?? "";
  copyText(code, btn);
}

export function copyText(text: string, btn?: HTMLElement | null) {
  navigator.clipboard?.writeText(text).then(() => {
    if (!btn) return;
    const was = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = was; }, 1200);
  });
}
