// `data ... live`: server-sent events tell clients which api changed; their data reloads.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
// @ts-ignore: runtime is plain JS
import { $api, $data, $live, effect, root, setApiBase } from "../runtime/runtime.js";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const SRC = 'model Msg {\n  id: ID\n  text: String\n}\n\napi msgs: Msg\n\npage Chat {\n  data msgs = api.msgs.list() live\n\n  for m in msgs {\n    text m.text\n  }\n}\n';

const servers: ReturnType<typeof createServer>[] = [];
after(() => { for (const s of servers) { s.closeAllConnections(); s.close(); } });

test("live: syntax, and another client's write reloads the data", async () => {
  assert.equal(printProgram(parse(SRC, "t")), SRC);
  const r = compile([{ file: "a.art", src: SRC }]);
  assert.deepEqual(r.diagnostics, []);
  assert.match(r.js!, /\$\.\$live\(\)/);

  const api = createApi(r.server!, mkdtempSync(join(tmpdir(), "art-live-")));
  const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  setApiBase(base);

  let seen: { text: string }[] = [];
  root(() => {
    const msgs = $data(() => $api("msgs").list(), []);
    effect(() => { seen = msgs.v; });
  });
  $live();
  await new Promise((ok) => setTimeout(ok, 100));
  // Another client (a plain request, not through this runtime) writes.
  await fetch(`${base}/api/msgs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hola" }) });
  for (let i = 0; i < 100 && seen.length === 0; i++) await new Promise((ok) => setTimeout(ok, 10));
  assert.deepEqual(seen.map((m) => m.text), ["hola"]);
});
