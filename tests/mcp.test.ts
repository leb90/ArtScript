// `art mcp`: the MCP tools agents call (spec, check, context, patch) over JSON-RPC.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mcpHandle, mcpTools } from "../src/mcp.ts";

test("mcp: initialize, list, and the tools", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-mcp-"));
  cpSync("examples/todo", dir, { recursive: true });
  const tools = mcpTools(dir, "docs");
  const call = (name: string, args: object) => (mcpHandle(tools, { id: 1, method: "tools/call", params: { name, arguments: args } }, "0") as any).result;

  const init = (mcpHandle(tools, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, "1.2.3") as any).result;
  assert.equal(init.serverInfo.version, "1.2.3");
  assert.equal(mcpHandle(tools, { method: "notifications/initialized" }, "0"), null);
  assert.deepEqual((mcpHandle(tools, { id: 2, method: "tools/list" }, "0") as any).result.tools.map((t: any) => t.name), ["art_spec", "art_check", "art_context", "art_patch"]);

  assert.match(call("art_spec", { kind: "edit" }).content[0].text, /spec for changing existing code/);
  assert.deepEqual(call("art_check", {}), { content: [{ type: "text", text: "ok" }], isError: false });
  assert.match(call("art_context", { names: ["Todos"] }).content[0].text, /page Todos "\/"/);

  const bad = call("art_patch", { patch: "replace Todos/column/nope\n  text \"x\"" });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /TARGET_NOT_FOUND/);
  assert.equal(call("art_patch", { patch: 'replace Todos/column/title\n  title "Mis tareas"' }).isError, false);
  assert.match(readFileSync(join(dir, "app.art"), "utf8"), /title "Mis tareas"/);
});
