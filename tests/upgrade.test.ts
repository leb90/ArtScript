// The instructions `art init` copies into a project (the specs, AGENTS.md, the Claude Code skill, the
// Cursor rule) follow the installed package: `art check` says when they're stale and `art upgrade`
// refreshes them, keeping what the project added to AGENTS.md.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const CLI = join(process.cwd(), "src", "cli.ts");
const art = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

function project(): string {
  const parent = mkdtempSync(join(tmpdir(), "art-upgrade-"));
  assert.equal(art(parent, "init", "app").status, 0);
  return join(parent, "app");
}

test("art check warns about stale instructions; art upgrade refreshes them and keeps the project's own", () => {
  const dir = project();
  assert.doesNotMatch(art(dir, "check").stdout, /INSTRUCTIONS_OUTDATED/, "a new project is up to date");

  writeFileSync(join(dir, "ARTSCRIPT.md"), "# ArtScript, an old spec\n");
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  writeFileSync(join(dir, "AGENTS.md"), agents.replace("Imperative code goes in", "Heavy code goes in") + "\n## Our team rules\n\nUse Spanish in the UI.\n");
  rmSync(join(dir, ".cursor", "rules", "artscript.mdc"));

  const checked = art(dir, "check", "--ai");
  assert.equal(checked.status, 0, "a warning doesn't fail the check");
  const w = checked.stdout.trim().split("\n").map((l) => JSON.parse(l)).find((d) => d.type === "INSTRUCTIONS_OUTDATED");
  assert.ok(w, checked.stdout);
  assert.equal(w.severity, "warning");
  assert.match(w.msg ?? w.actual, /ARTSCRIPT\.md/);
  assert.deepEqual(w.fixes, ["npx art upgrade"]);

  const up = art(dir, "upgrade");
  assert.equal(up.status, 0, up.stderr);
  assert.match(up.stdout, /ARTSCRIPT\.md/);
  assert.equal(readFileSync(join(dir, "ARTSCRIPT.md"), "utf8"), readFileSync("docs/SPEC.md", "utf8"));
  const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(after, /Imperative code goes in/);
  assert.match(after, /## Our team rules\n\nUse Spanish in the UI\./, "what the project added stays");
  assert.ok(existsSync(join(dir, ".cursor", "rules", "artscript.mdc")), "a missing file is added back");
  assert.doesNotMatch(art(dir, "check").stdout, /INSTRUCTIONS_OUTDATED/);
  assert.match(art(dir, "upgrade").stdout, /up to date/);
});

test("art upgrade replaces an AGENTS.md that is exactly what an older art init wrote, without a backup", () => {
  const dir = project();
  const old = readFileSync("tests/fixtures/upgrade/AGENTS-0.2.0.md", "utf8"); // as `art init` 0.2.0 wrote it
  writeFileSync(join(dir, "AGENTS.md"), old);
  assert.equal(art(dir, "upgrade").status, 0);
  assert.ok(!existsSync(join(dir, "AGENTS.md.old")));
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), readFileSync("templates/default/AGENTS.md", "utf8"));
});

test("art upgrade on a project from before the managed block keeps the old AGENTS.md aside", () => {
  const dir = project();
  const old = "# Instructions for AI agents\n\nThis project uses **ArtScript**.\n\n- Heavy imperative code goes in a `.ts` file.\n- Our own rule.\n";
  writeFileSync(join(dir, "AGENTS.md"), old);
  const up = art(dir, "upgrade");
  assert.equal(up.status, 0, up.stderr);
  assert.equal(readFileSync(join(dir, "AGENTS.md.old"), "utf8"), old);
  assert.match(up.stdout, /AGENTS\.md\.old/);
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), readFileSync("templates/default/AGENTS.md", "utf8"));
});
