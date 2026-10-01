// Official components (art add): they compile together and behave, checked with ArtScript tests.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runTests } from "../src/testing.ts";

const DIR = "templates/components";
const DEMO = `page Demo {
  state rows = [{ name: "Ana", city: "Rosario" }, { name: "Beto", city: "Córdoba" }, { name: "Ceci", city: "Mendoza" }]
  state q = ""
  state deleted = false

  DataTable rows=rows columns=["name", "city"] pageSize=2
  SearchBox query=q placeholder="Find"
  text \`query: \${q}\`
  ConfirmButton label="Delete" onConfirm=(() => deleted = true)
  if deleted {
    text "Deleted!"
  }
  Stat label="People" value=rows.length
  EmptyState title="Nothing here"
}

test "the table sorts, searches and pages" {
  see "Page 1 of 2"
  click "name"
  click "name ↑"
  see "name ↓"
  fill "Search" "cór"
  see "Beto"
  notSee "Ana"
  see "Page 1 of 1"
}

test "search box binds the parent's state" {
  fill "Find" "hola"
  see "query: hola"
  click "Clear"
  notSee "query: hola"
}

test "confirm asks first" {
  click "Delete"
  see "Are you sure?"
  click "Cancel"
  notSee "Deleted!"
  click "Delete"
  click "Delete" 1
  see "Deleted!"
}
`;

test("components: compile together and behave", async () => {
  const sources = readdirSync(DIR).map((f) => ({ file: f, src: readFileSync(join(DIR, f), "utf8") }));
  const r = await runTests([...sources, { file: "demo.art", src: DEMO }]);
  assert.ok(!("diagnostics" in r), JSON.stringify(r));
  assert.deepEqual((r as any[]).filter((t) => !t.ok).map((t) => `${t.name}: ${t.error}`), []);
  assert.equal((r as any[]).length, 3);
});

test("art add copies components into src/", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-add-"));
  mkdirSync(join(dir, "src"));
  execFileSync(process.execPath, ["src/cli.ts", "add", "datatable", "Pagination", "--dir", dir], { stdio: "pipe" });
  assert.ok(existsSync(join(dir, "src", "DataTable.art")) && existsSync(join(dir, "src", "Pagination.art")));
  assert.throws(() => execFileSync(process.execPath, ["src/cli.ts", "add", "Nope", "--dir", dir], { stdio: "pipe" }), /unknown component 'Nope'/);
});
