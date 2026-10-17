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
