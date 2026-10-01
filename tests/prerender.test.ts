// `art build --prerender` and `meta`: HTML with the page's content and tags, replaced by the live app.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { parse } from "../src/parser.ts";

const types = (src: string) => check(parse(src, "t.art")).map((d) => d.type);

test("meta: props are checked", () => {
  assert.deepEqual(types('page P {\n  state n = 2\n  meta title=`${n} items` description="d" image="/og.png"\n}'), []);
  assert.deepEqual(types('page P {\n  meta titel="x"\n}'), ["UNKNOWN_PROP"]);
  assert.deepEqual(types("page P {\n  meta title=3\n}"), ["TYPE_MISMATCH"]);
});

test("prerender: static routes get their HTML and tags; the live app takes over without duplicates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "art-pre-"));
  cpSync("examples/blog", dir, { recursive: true });
  execFileSync(process.execPath, ["src/cli.ts", "build", dir, "--prerender"], { stdio: "pipe" });
  const dist = join(dir, "dist");
  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<title>Blog<\/title>/);
  assert.match(home, /<meta name="description" content="Notes about ArtScript.">/);
  assert.match(home, /<a href="\/posts\/hello">Hello, ArtScript<\/a>/);
  assert.ok(existsSync(join(dist, "about", "index.html")));
  assert.doesNotMatch(readFileSync(join(dist, "_app.html"), "utf8"), /Hello, ArtScript/, "the fallback shell is empty");

  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    const [, head, body] = /<head>(.*)<\/head><body>(.*)<script/.exec(home)!;
    document.head.innerHTML = head;
    document.body.innerHTML = body;
    await import(pathToFileURL(join(dist, "app.js")).href);
    await new Promise((ok) => setTimeout(ok, 20));
    const text = document.getElementById("app")!.textContent!;
    assert.equal(text.match(/Hello, ArtScript/g)!.length, 1);
    assert.equal(document.querySelectorAll("style#art-css").length, 1);
  } finally {
    await GlobalRegistrator.unregister();
  }
});
