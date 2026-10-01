// `art mcp`: a Model Context Protocol server over stdio (JSON-RPC 2.0, one message per line), so
// agents (Claude Code, Cursor, ...) call ArtScript's tools directly: check, context, patch and the
// spec. No dependencies.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { analyze } from "./checker.ts";
import { parseProject, type Source } from "./compile.ts";
import { declContexts, projectMap } from "./context.ts";
import { formatAI } from "./errors.ts";
import { applyPatch } from "./patch.ts";

type Tool = { name: string; description: string; inputSchema: object; run: (args: Record<string, unknown>) => { text: string; ok: boolean } };
const ok = (text: string) => ({ text, ok: true });
const fail = (text: string) => ({ text, ok: false });

function findArt(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findArt(p));
    else if (extname(e.name) === ".art") out.push(p);
  }
  return out.sort();
}

export function mcpTools(root: string, specDir: string): Tool[] {
  const dirOf = (args: Record<string, unknown>) => resolve(root, String(args.dir ?? "."));
  const sources = (dir: string): Source[] => {
    if (!existsSync(dir)) throw new Error(`not found: ${dir}`);
    const files = statSync(dir).isDirectory() ? findArt(dir) : [dir];
    if (!files.length) throw new Error(`no .art files in ${dir}`);
    return files.map((f) => ({ file: relative(root, f) || f, src: readFileSync(f, "utf8") }));
  };
  const dirProp = { dir: { type: "string", description: "Project directory or .art file, relative to the workspace (default: the workspace)" } };
  return [
    {
      name: "art_spec",
      description: "The ArtScript spec. Read it before writing ArtScript. `edit` is a short version for changing existing code.",
      inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["full", "edit"] } } },
      run: (a) => ok(readFileSync(join(specDir, a.kind === "edit" ? "SPEC-EDIT.md" : "SPEC.md"), "utf8")),
    },
    {
      name: "art_check",
      description: "Type-checks the project. Returns `ok` or the errors as JSON lines with code, location, expected/actual and fixes.",
      inputSchema: { type: "object", properties: dirProp },
      run: (a) => {
        const { program, diagnostics } = parseProject(sources(dirOf(a)));
        const errs = diagnostics.length ? diagnostics : analyze(program).diagnostics;
        return errs.length ? fail(errs.map(formatAI).join("\n")) : ok("ok");
      },
    },
    {
      name: "art_context",
      description: "Compact context for changing code: without names, the project map; with names (components, models, `Component/path`), their source and every addressable patch path.",
      inputSchema: { type: "object", properties: { ...dirProp, names: { type: "array", items: { type: "string" } } } },
      run: (a) => {
        const { program, diagnostics } = parseProject(sources(dirOf(a)));
        if (diagnostics.length) return fail(diagnostics.map(formatAI).join("\n"));
        const names = (a.names as string[] | undefined) ?? [];
        if (!names.length) return ok(projectMap(program, analyze(program), Infinity));
        const out = declContexts(program, analyze(program), names, Infinity);
        return out === null ? fail(`unknown name; declarations: ${program.decls.map((d) => d.name).join(", ")}`) : ok(out);
      },
    },
    {
      name: "art_patch",
      description: "Applies an `art patch` (replace/insert/append/remove/set/add operations; see art_spec). Atomic and type-checked: on any error nothing is written and the errors are returned.",
      inputSchema: { type: "object", properties: { ...dirProp, patch: { type: "string" }, dryRun: { type: "boolean" } }, required: ["patch"] },
      run: (a) => {
        const dir = dirOf(a);
        const r = applyPatch(sources(dir), String(a.patch));
        if (r.diagnostics.length) return fail(r.diagnostics.map(formatAI).join("\n"));
        if (a.dryRun) return ok(r.changed.map((f) => `--- ${f}\n${r.files[f]}`).join("\n") || "no changes");
        const base = statSync(dir).isDirectory() ? dir : dirname(dir);
        for (const f of r.changed) writeFileSync(existsSync(resolve(root, f)) ? resolve(root, f) : join(base, f), r.files[f]);
        return ok(r.changed.length ? `ok: updated ${r.changed.join(", ")}` : "ok: no changes");
      },
    },
  ];
}

// Handles one JSON-RPC message; returns the response, or null for notifications.
export function mcpHandle(tools: Tool[], msg: { id?: number | string; method: string; params?: any }, version: string): object | null {
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "artscript", version },
        instructions: "ArtScript is a web language for AI. Read art_spec once, then use art_context before changing code, art_patch to change it and art_check to verify.",
      });
    case "ping": return reply({});
    case "tools/list": return reply({ tools: tools.map(({ run: _, ...t }) => t) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === msg.params?.name);
      if (!tool) return { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: `unknown tool: ${msg.params?.name}` } };
      try {
        const r = tool.run(msg.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: r.text }], isError: !r.ok });
      } catch (e) {
        return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    default:
      if (msg.id === undefined) return null; // notifications (e.g. notifications/initialized)
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } };
  }
}

export function runMcp(root: string, specDir: string, version: string) {
  const tools = mcpTools(root, specDir);
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) + "\n");
      return;
    }
    const res = mcpHandle(tools, msg, version);
    if (res) process.stdout.write(JSON.stringify(res) + "\n");
  });
}
