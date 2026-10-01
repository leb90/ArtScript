// `art lsp`: diagnostics with the unsaved text, formatting and completion.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { LanguageServer } from "../src/lsp.ts";

test("lsp: live diagnostics, formatting and completion", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-lsp-"));
  cpSync("examples/todo", dir, { recursive: true });
  const sent: any[] = [];
  const ls = new LanguageServer((m) => sent.push(m));
  const uri = pathToFileURL(join(dir, "app.art")).href;
  assert.equal((ls.handle({ id: 1, method: "initialize", params: {} }) as any).result.capabilities.documentFormattingProvider, true);

  // An unsaved typo: reported at its place with the fix.
  const bad = 'page P "/" {\n  colum gap=2 {\n    text "a"\n  }\n}\n';
  ls.handle({ method: "textDocument/didOpen", params: { textDocument: { uri, text: bad } } });
  const [d] = sent.at(-1).params.diagnostics;
  assert.deepEqual(d.range, { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } });
  assert.match(d.message, /unknown element 'colum'\nfix: column/);

  // Fixed (and badly indented): no diagnostics; formatting returns the canonical text.
  ls.handle({ method: "textDocument/didChange", params: { textDocument: { uri }, contentChanges: [{ text: 'page P "/" {\n column gap=2 {\n text "a"\n }\n}\n' }] } });
  assert.deepEqual(sent.at(-1).params.diagnostics, []);
  const [edit] = (ls.handle({ id: 2, method: "textDocument/formatting", params: { textDocument: { uri } } }) as any).result;
  assert.equal(edit.newText, 'page P "/" {\n  column gap=2 {\n    text "a"\n  }\n}\n');

  // Completion: elements and components at the start of a line, props and flags after `button`.
  const at = (text: string, line: number, character: number) => {
    ls.handle({ method: "textDocument/didChange", params: { textDocument: { uri }, contentChanges: [{ text }] } });
    return (ls.handle({ id: 3, method: "textDocument/completion", params: { textDocument: { uri }, position: { line, character } } }) as any).result.map((c: any) => c.label);
  };
  const doc = 'component Card {\n  text "x"\n}\n\npage P "/" {\n  \n  button "x" \n}\n';
  assert.ok(at(doc, 5, 2).includes("select") && at(doc, 5, 2).includes("Card"));
  assert.ok(at(doc, 6, 13).includes("primary") && at(doc, 6, 13).includes("disabled"));
});
