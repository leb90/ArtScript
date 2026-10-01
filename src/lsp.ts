// `art lsp`: a Language Server Protocol server over stdio (no dependencies), for any editor with
// LSP support: live errors (the whole project is checked, with the open buffers' unsaved text),
// formatting (art fmt) and completion (elements, their props and flags, components, keywords).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze } from "./checker.ts";
import { parseProject, type Source } from "./compile.ts";
import { ELEMENTS } from "./elements.ts";
import type { Diagnostic } from "./errors.ts";
import { parse } from "./parser.ts";
import { printProgram } from "./printer.ts";

const KEYWORDS = ["model", "api", "auth", "use", "server fn", "server job", "component", "page", "layout", "state", "computed", "data", "fn", "ref", "mount", "effect", "cleanup", "if", "else", "for", "slot", "meta", "live"];

function findArt(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findArt(p));
    else if (extname(e.name) === ".art") out.push(p);
  }
  return out;
}

// The project of a file: the nearest directory up with a package.json, else the file's directory.
function projectDir(file: string): string {
  for (let d = dirname(file); ; d = dirname(d)) {
    if (existsSync(join(d, "package.json"))) return d;
    if (dirname(d) === d) return dirname(file);
  }
}

export class LanguageServer {
  docs = new Map<string, string>(); // uri → text
  send: (msg: object) => void;
  constructor(send: (msg: object) => void) { this.send = send; }

  // Every .art file of the project, with open buffers' text instead of what's on disk.
  sources(file: string): Source[] {
    const dir = projectDir(file);
    const files = new Set(statSync(dir).isDirectory() ? findArt(dir) : []);
    files.add(file);
    return [...files].map((f) => ({ file: f, src: this.docs.get(pathToFileURL(f).href) ?? readFileSync(f, "utf8") }));
  }

  diagnose(uri: string) {
    const file = fileURLToPath(uri);
    const { program, diagnostics } = parseProject(this.sources(file));
    const all: Diagnostic[] = diagnostics.length ? diagnostics : analyze(program).diagnostics;
    const lines = (this.docs.get(uri) ?? "").split("\n");
    const items = all.filter((d) => resolve(d.loc.file) === resolve(file)).map((d) => {
      const line = Math.max(0, d.loc.line - 1), col = Math.max(0, d.loc.col - 1);
      const len = d.expr && lines[line]?.slice(col).startsWith(d.expr) ? d.expr.length : Math.max(1, (lines[line]?.length ?? col + 1) - col);
      const fix = d.fixes?.length ? `\nfix: ${d.fixes.slice(0, 3).join(" | ")}` : "";
      return { range: { start: { line, character: col }, end: { line, character: col + len } }, severity: 1, source: "artscript", code: d.code, message: `${d.msg}${fix}` };
    });
    this.send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, diagnostics: items } });
  }

  format(uri: string): object[] | null {
    const text = this.docs.get(uri) ?? "";
    try {
      const out = printProgram(parse(text, fileURLToPath(uri)));
      const lines = text.split("\n");
      return out === text ? [] : [{ range: { start: { line: 0, character: 0 }, end: { line: lines.length, character: 0 } }, newText: out }];
    } catch { return null; } // not formatted while it has syntax errors
  }

  complete(uri: string, line: number, character: number): object[] {
    const text = this.docs.get(uri) ?? "";
    const before = (text.split("\n")[line] ?? "").slice(0, character);
    // After an element's name: its props (`name=`) and flags.
    const el = /^\s*([a-z]\w*)\s+(?:.*\s)?\w*$/.exec(before);
    if (el && ELEMENTS[el[1]]) {
      const spec = ELEMENTS[el[1]];
      return [...spec.props.map((p) => ({ label: p, kind: 10, insertText: `${p}=` })), ...spec.flags.map((f) => ({ label: f, kind: 12 }))];
    }
    let comps: string[] = [];
    try { comps = parse(text, "x").decls.flatMap((d) => (d.kind === "Component" && !d.page ? [d.name] : [])); } catch { /* while typing */ }
    return [
      ...Object.keys(ELEMENTS).map((e) => ({ label: e, kind: 10, detail: `element (${ELEMENTS[e].html})` })),
      ...comps.map((c) => ({ label: c, kind: 7, detail: "component" })),
      ...KEYWORDS.map((k) => ({ label: k, kind: 14 })),
    ];
  }

  handle(msg: { id?: number | string; method?: string; params?: any }): object | null {
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
    const p = msg.params;
    switch (msg.method) {
      case "initialize":
        return reply({
          capabilities: { textDocumentSync: 1, documentFormattingProvider: true, completionProvider: { triggerCharacters: [" "] } },
          serverInfo: { name: "artscript" },
        });
      case "textDocument/didOpen": this.docs.set(p.textDocument.uri, p.textDocument.text); this.diagnose(p.textDocument.uri); return null;
      case "textDocument/didChange": this.docs.set(p.textDocument.uri, p.contentChanges.at(-1).text); this.diagnose(p.textDocument.uri); return null;
      case "textDocument/didSave": this.diagnose(p.textDocument.uri); return null;
      case "textDocument/didClose": this.docs.delete(p.textDocument.uri); return null;
      case "textDocument/formatting": return reply(this.format(p.textDocument.uri));
      case "textDocument/completion": return reply(this.complete(p.textDocument.uri, p.position.line, p.position.character));
      case "shutdown": return reply(null);
      case "exit": process.exit(0);
      default: return msg.id !== undefined ? { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } } : null;
    }
  }
}

// LSP framing over stdio: `Content-Length: N\r\n\r\n` then N bytes of JSON.
export function runLsp() {
  const write = (msg: object) => {
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    process.stdout.write(body);
  };
  const server = new LanguageServer(write);
  let buf = Buffer.alloc(0);
  process.stdin.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const sep = buf.indexOf("\r\n\r\n");
      if (sep < 0) return;
      const len = Number(/Content-Length: (\d+)/i.exec(buf.subarray(0, sep).toString())?.[1] ?? 0);
      if (buf.length < sep + 4 + len) return;
      const msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString("utf8"));
      buf = buf.subarray(sep + 4 + len);
      try {
        const res = server.handle(msg);
        if (res) write(res);
      } catch (e) {
        if (msg.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: (e as Error).message } });
      }
    }
  });
}
