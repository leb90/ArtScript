// `art init --template`: new projects from the examples, with both specs for agents.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("starters are the examples, and init --template uses them", () => {
  for (const f of readdirSync("templates/starters")) {
    assert.equal(readFileSync(join("templates/starters", f), "utf8"), readFileSync(join("examples", f.replace(".art", ""), "app.art"), "utf8"), `templates/starters/${f} is out of date: copy examples/${f.replace(".art", "")}/app.art`);
  }
  const dir = join(mkdtempSync(join(tmpdir(), "art-init-")), "app");
  execFileSync(process.execPath, ["src/cli.ts", "init", dir, "--template", "notes"], { stdio: "pipe" });
  assert.equal(readFileSync(join(dir, "src", "app.art"), "utf8"), readFileSync("examples/notes/app.art", "utf8"));
  assert.ok(existsSync(join(dir, "ARTSCRIPT.md")) && existsSync(join(dir, "ARTSCRIPT-EDIT.md")) && existsSync(join(dir, ".gitignore")));
  assert.match(readFileSync(join(dir, ".cursor", "rules", "artscript.mdc"), "utf8"), /globs: \*\*\/\*\.art/);
  assert.throws(() => execFileSync(process.execPath, ["src/cli.ts", "init", dir + "2", "--template", "nope"], { stdio: "pipe" }), /unknown template 'nope'/);
});
