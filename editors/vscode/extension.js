// ArtScript for VS Code: starts `art lsp` and speaks just enough LSP to show live errors, format and
// complete. No dependencies.
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const vscode = require("vscode");

function command(folder) {
  const configured = vscode.workspace.getConfiguration("artscript").get("command");
  if (configured) return configured.split(" ");
  const local = folder && join(folder, "node_modules", ".bin", process.platform === "win32" ? "art.cmd" : "art");
  return [local && existsSync(local) ? local : "art"];
}

function activate(context) {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const [cmd, ...args] = command(folder);
  const proc = spawn(cmd, [...args, "lsp"], { cwd: folder, shell: process.platform === "win32" });
  const diagnostics = vscode.languages.createDiagnosticCollection("artscript");
  const pending = new Map();
  let id = 0, buf = Buffer.alloc(0);

  const send = (msg) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
    proc.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    proc.stdin.write(body);
  };
  const request = (method, params) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); send({ id: n, method, params }); });

  proc.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const sep = buf.indexOf("\r\n\r\n");
      if (sep < 0) return;
      const len = Number(/Content-Length: (\d+)/i.exec(buf.subarray(0, sep).toString())?.[1] ?? 0);
      if (buf.length < sep + 4 + len) return;
      const msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString("utf8"));
      buf = buf.subarray(sep + 4 + len);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
      if (msg.method === "textDocument/publishDiagnostics") {
        const list = msg.params.diagnostics.map((d) => {
          const r = new vscode.Range(d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character);
          const item = new vscode.Diagnostic(r, d.message, vscode.DiagnosticSeverity.Error);
          item.source = "artscript";
          item.code = d.code;
          return item;
        });
        diagnostics.set(vscode.Uri.parse(msg.params.uri), list);
      }
    }
  });
  proc.on("error", () => vscode.window.showWarningMessage("ArtScript: couldn't start `art lsp`. Install artscript in the project or set artscript.command."));

  request("initialize", { processId: process.pid, rootUri: folder ? vscode.Uri.file(folder).toString() : null, capabilities: {} });
  const isArt = (doc) => doc.languageId === "artscript";
  const open = (doc) => isArt(doc) && send({ method: "textDocument/didOpen", params: { textDocument: { uri: doc.uri.toString(), languageId: "artscript", version: doc.version, text: doc.getText() } } });
  vscode.workspace.textDocuments.forEach(open);
  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(open),
    vscode.workspace.onDidChangeTextDocument((e) => isArt(e.document) && send({ method: "textDocument/didChange", params: { textDocument: { uri: e.document.uri.toString(), version: e.document.version }, contentChanges: [{ text: e.document.getText() }] } })),
    vscode.workspace.onDidCloseTextDocument((doc) => isArt(doc) && send({ method: "textDocument/didClose", params: { textDocument: { uri: doc.uri.toString() } } })),
    vscode.languages.registerDocumentFormattingEditProvider("artscript", {
      async provideDocumentFormattingEdits(doc) {
        const edits = await request("textDocument/formatting", { textDocument: { uri: doc.uri.toString() } });
        return (edits ?? []).map((e) => vscode.TextEdit.replace(new vscode.Range(e.range.start.line, e.range.start.character, e.range.end.line, e.range.end.character), e.newText));
      },
    }),
    vscode.languages.registerCompletionItemProvider("artscript", {
      async provideCompletionItems(doc, pos) {
        const items = await request("textDocument/completion", { textDocument: { uri: doc.uri.toString() }, position: { line: pos.line, character: pos.character } });
        return (items ?? []).map((c) => Object.assign(new vscode.CompletionItem(c.label, c.kind - 1), { detail: c.detail, insertText: c.insertText }));
      },
    }, " "),
    vscode.languages.registerDefinitionProvider("artscript", {
      async provideDefinition(doc, pos) {
        const r = await request("textDocument/definition", { textDocument: { uri: doc.uri.toString() }, position: { line: pos.line, character: pos.character } });
        return r ? new vscode.Location(vscode.Uri.parse(r.uri), new vscode.Position(r.range.start.line, r.range.start.character)) : null;
      },
    }),
    vscode.languages.registerHoverProvider("artscript", {
      async provideHover(doc, pos) {
        const r = await request("textDocument/hover", { textDocument: { uri: doc.uri.toString() }, position: { line: pos.line, character: pos.character } });
        return r ? new vscode.Hover(new vscode.MarkdownString(r.contents.value)) : null;
      },
    }),
    vscode.languages.registerRenameProvider("artscript", {
      async provideRenameEdits(doc, pos, newName) {
        const r = await request("textDocument/rename", { textDocument: { uri: doc.uri.toString() }, position: { line: pos.line, character: pos.character }, newName });
        const edit = new vscode.WorkspaceEdit();
        for (const [uri, edits] of Object.entries(r?.changes ?? {})) {
          for (const e of edits) edit.replace(vscode.Uri.parse(uri), new vscode.Range(e.range.start.line, e.range.start.character, e.range.end.line, e.range.end.character), e.newText);
        }
        return edit;
      },
    }),
    { dispose: () => proc.kill() },
  );
}

module.exports = { activate, deactivate() {} };
