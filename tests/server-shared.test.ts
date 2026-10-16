// `use` and top-level code across the client and the server: the browser bundle imports only what
// client code uses (a Node-only module used by a server fn stays out), and a top-level `fn`/`const`
// that doesn't touch the page runs in server fns too.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { runTests } from "../src/testing.ts";

test("a module only server fns use stays out of the browser bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-srvuse-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "app.art"), `use "node:crypto" { createHash }
server fn digest(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8)
}

page Home "/" {
  data d = server.digest("hi")

  text d ?? ""
}
`);
  execFileSync(process.execPath, ["src/cli.ts", "build", join(dir, "src")], { stdio: "pipe" });
  const app = readFileSync(join(dir, "dist", "app.js"), "utf8");
  assert.doesNotMatch(app, /createHash/);
  assert.match(readFileSync(join(dir, "dist", "server.js"), "utf8"), /createHash/);
});

const SHARED = `model Item {
  id: ID
  name: String
}

api items: Item

const TAX = 0.21
const RATE = TAX * 100

fn price(lines) {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0) * (1 + TAX)
}

fn label(n) {
  return \`$\${n.toFixed(2)} (\${RATE}% tax)\`
}

server fn quote(lines) {
  return label(price(lines))
}

page Home "/" {
  state lines = [{ price: 10, qty: 2 }]
  data quoted = server.quote(lines)

  text \`client \${label(price(lines))}\`
  text \`server \${quoted ?? ""}\`
}

test "same result on both sides" {
  open "/"
  see "client $24.20 (21% tax)"
  see "server $24.20 (21% tax)"
}
`;

test("a top-level fn or const that doesn't touch the page runs in server fns too", async () => {
  assert.deepEqual(check(parse(SHARED, "a.art")).map((d) => d.msg), []);
  const r = compile([{ file: "a.art", src: SHARED }]);
  assert.match(r.server!.fns, /function price\(lines\)/);
  assert.match(r.server!.fns, /const TAX = 0\.21/);
  assert.deepEqual(await runTests([{ file: "app.art", src: SHARED }]), [{ name: 'test "same result on both sides"', ok: true }]);
});

test("a server fn calling a top-level fn that reads the page's state is an error that says why", () => {
  const src = `state cart = []

fn total() {
  return cart.length
}

server fn count() {
  return total()
}

page P {
  text "x"
}
`;
  const [d] = check(parse(src, "a.art"));
  assert.equal(d?.type, "UNDEFINED_NAME");
  assert.match(d.msg, /'total' can't run on the server: it reads the state 'cart'/);
  assert.match(d.fixes![0], /parameter/);
});
