// `test "..." { }` blocks and `art test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
import { runTests } from "../src/testing.ts";

const types = (src: string) => check(parse(src, "t")).map((d) => d.type);

test("test blocks: canonical format and checked steps", () => {
  const src = 'page P {\n  text "hi"\n}\n\ntest "greets" {\n  open "/"\n  see "hi"\n  click "Add" 1\n  select 0 "Two"\n}\n';
  assert.equal(printProgram(parse(src, "t")), src);
  assert.deepEqual(types(src), []);
  const [d] = check(parse('page P {\n  text "hi"\n}\ntest "x" {\n  sees "hi"\n}\n', "t"));
  assert.deepEqual([d.type, d.fixes], ["UNDEFINED_NAME", ["see"]]);
  assert.deepEqual(types('page P {\n  text "hi"\n}\ntest "x" {\n  fill "Name"\n}\n'), ["TYPE_MISMATCH"]);
});

test("art test: runs the examples' tests (one with a server and accounts)", async () => {
  for (const ex of ["todo", "crm"]) {
    const r = await runTests([{ file: "app.art", src: readFileSync(`examples/${ex}/app.art`, "utf8") }]);
    assert.ok(!("diagnostics" in r), JSON.stringify(r));
    assert.deepEqual((r as any[]).map((t) => [t.name, t.ok, t.error ?? ""]).filter((t) => !t[1]), []);
  }
  const bad = await runTests([{ file: "app.art", src: 'page P {\n  text "hi"\n}\n\ntest "wrong" {\n  see "bye"\n}\n' }]);
  assert.match((bad as any[])[0].error, /line 6: see: expected "bye"; the screen shows: "hi"/);
});

test("art test: click finds a button by its text or by its aria-label, even when it has text", async () => {
  const src = `page P "/" {
  state n = 0

  button \`Liked \${n} times\` aria-label="Like" -> n++
  text \`n=\${n}\`
}

test "by aria-label" {
  open "/"
  click "Like"
  click "Like"
  see "n=2"
  click "Liked 2 times"
  see "n=3"
}
`;
  const r = await runTests([{ file: "app.art", src }]);
  assert.deepEqual(r, [{ name: 'test "by aria-label"', ok: true }]);
  const bad = await runTests([{ file: "app.art", src: src.replace(/test "by aria-label"[\s\S]*$/, 'test "missing" {\n  open "/"\n  click "Dislike"\n}\n') }]);
  assert.match((bad as any[])[0].error, /no button "Dislike"; buttons: "Liked 0 times" \(aria-label "Like"\)/);
});

test("art test --api: the tests talk to the app's own server (its messages), resetting it before each one", async () => {
  const { createServer } = await import("node:http");
  let resets = 0;
  let items: { id: string; name: string }[] = [];
  const own = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, value: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
      // A usual CSRF check: a write must come from the site the request was sent to.
      const from = req.headers.origin ?? req.headers.referer;
      if (req.method === "POST" && from && new URL(from).host !== req.headers.host) return send(403, { message: "Origen no permitido" });
      if (req.url === "/api/_test/reset" && req.method === "POST") { resets++; items = []; return send(200, { ok: true }); }
      if (req.url?.startsWith("/api/items") && req.method === "GET") return send(200, items);
      if (req.url === "/api/items" && req.method === "POST") {
        const { name } = JSON.parse(body || "{}");
        if (!name) return send(400, { error: "VALIDATION", message: "El nombre es obligatorio" });
        const item = { id: String(items.length + 1), name };
        items.push(item);
        return send(201, item);
      }
      send(404, { message: "no" });
    });
  });
  await new Promise<void>((ok) => own.listen(0, ok));
  const api = `http://localhost:${(own.address() as any).port}`;
  const src = `model Item {
  id: ID
  name: String min=1
}

api items: Item

page P "/" {
  data items = api.items.list()
  state name = ""
  state problem = ""
  fn add() {
    try {
      await api.items.create({ name })
      problem = ""
    } catch (e) {
      problem = e.message
    }
  }

  input name placeholder="Nombre"
  button "Agregar" -> add()
  text problem
  for i in items {
    text i.name
  }
}

test "the server's own message" {
  open "/"
  click "Agregar"
  see "El nombre es obligatorio"
  fill "Nombre" "Mate"
  click "Agregar"
  see "Mate"
}

test "starts from an empty server" {
  open "/"
  notSee "Mate"
}
`;
  try {
    const r = await runTests([{ file: "app.art", src }], { api, reset: "/api/_test/reset" });
    assert.deepEqual((r as any[]).map((t) => [t.name, t.ok, t.error ?? ""]), [['test "the server\'s own message"', true, ""], ['test "starts from an empty server"', true, ""]]);
    assert.equal(resets, 2, "reset before each test");
    // Without --api, ArtScript's own server answers (its own validation message).
    const plain = await runTests([{ file: "app.art", src }]);
    assert.equal((plain as any[])[0].ok, false);
  } finally {
    own.close();
  }
});

test("art test: a request still running when a test ends doesn't crash the run; an error during a test fails it", async () => {
  const { spawn } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createServer } = await import("node:http");
  // Slower than what art test waits for when a test ends.
  const own = createServer((req, res) => {
    const send = (status: number, value: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    if (req.url === "/api/items" && req.method === "POST") return setTimeout(() => send(201, { id: "1", name: "x" }), 1500);
    if (req.url === "/api/items" && req.method === "GET") return send(500, { message: "broken" });
    send(404, { message: "no" });
  });
  await new Promise<void>((ok) => own.listen(0, ok));
  const dir = mkdtempSync(join(tmpdir(), "art-late-"));
  writeFileSync(join(dir, "app.art"), `model Item {
  id: ID
  name: String
}

api items: Item

page P "/" {
  fn add() {
    await api.items.create({ name: "x" })
    navigate("/done")
  }
  fn load() {
    await api.items.list()
  }

  button "Add" -> add()
  button "Load" -> load()
}

page Done "/done" {
  text "done"
}

test "leaves a request running" {
  open "/"
  click "Add"
}

test "an error in the page" {
  open "/"
  click "Load"
  see "Add"
}

test "opens a page while a request runs" {
  open "/"
  click "Add"
  open "/"
  see "Add"
}

test "the next one runs" {
  open "/"
  see "Add"
}
`);
  try {
    const run = spawn(process.execPath, ["src/cli.ts", "test", dir, "--api", `http://localhost:${(own.address() as any).port}`]);
    let output = "";
    run.stdout.on("data", (c) => (output += c));
    run.stderr.on("data", (c) => (output += c));
    const code = await new Promise((done) => run.on("exit", done));
    assert.match(output, /✓ "leaves a request running"/, output);
    assert.match(output, /✗ "an error in the page"[\s\S]*the page threw: broken/, output);
    assert.match(output, /✓ "opens a page while a request runs"/, output);
    assert.match(output, /✓ "the next one runs"/, output);
    assert.match(output, /3 passed, 1 failed/);
    assert.doesNotMatch(output, /aborted/i, "the requests art test stops aren't reported");
    assert.equal(code, 1);
  } finally {
    own.close();
  }
});

test("art test: requests to other sites need a respond step; labels match with Intl's no-break space", async () => {
  const app = `page Home "/" {
  state sent = ""
  fn send() {
    let res = await fetch("https://forms.example/submit", { method: "POST" })
    let body = await res.json()
    sent = body.ok ? "Sent" : "Failed"
  }
  button \`Pay · \${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(10)}\` -> send()
  text sent
}
`;
  const stubbed = `test "stubbed" {\n  respond "https://forms.example/*" 200 { "ok": true }\n  click "Pay · 10,00 €"\n  see "Sent"\n}\n`;
  const unstubbed = `test "unstubbed" {\n  click "Pay · 10,00 €"\n  see "Sent"\n}\n`;
  const [ok] = (await runTests([{ file: "app.art", src: app + "\n" + stubbed }])) as any[];
  assert.deepEqual(ok, { name: 'test "stubbed"', ok: true });
  // The refused request is the page's error: through the CLI, as a user runs it.
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "art-respond-"));
  writeFileSync(join(dir, "app.art"), app + "\n" + unstubbed);
  const run = spawnSync(process.execPath, ["src/cli.ts", "test", dir], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stdout + run.stderr, /✗ "unstubbed"[\s\S]*doesn't reach other sites: add `respond "https:\/\/forms.example\/\*" 200 \{ \}`/);
});
