// `art build --prerender` and `meta`: HTML with the page's content and tags, replaced by the live app.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  execFileSync(process.execPath, ["src/cli.ts", "build", dir, "--prerender", "--site", "https://blog.example/"], { stdio: "pipe" });
  const dist = join(dir, "dist");
  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<title>Blog<\/title>/);
  assert.match(home, /<meta name="description" content="Notes about ArtScript.">/);
  assert.match(home, /<a href="\/posts\/hello">Hello, ArtScript<\/a>/);
  assert.ok(existsSync(join(dist, "about", "index.html")));
  assert.match(readFileSync(join(dist, "sitemap.xml"), "utf8"), /<loc>https:\/\/blog.example\/<\/loc>[\s\S]*<loc>https:\/\/blog.example\/about<\/loc>/);
  assert.match(readFileSync(join(dist, "robots.txt"), "utf8"), /Sitemap: https:\/\/blog.example\/sitemap.xml/);
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

test("prerender: styles written as text, browser-only code in mount, 404.html, favicon and an absolute og:image", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-pre2-"));
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "public", "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(dir, "app.art"), `page Home "/" {
  state big = true
  meta title="Home" image="/og.png"
  mount {
    document.documentElement.style.setProperty("--x", "1")
    window.matchMedia("(min-width: 1px)").addEventListener("change", () => null)
  }

  column gap=2 style="--d: 40ms" id="box" {
    title "Hello" tag=h1 class=(big ? "hero big" : "hero")
  }
  form novalidate
}

page Missing "*" {
  text "Nothing here"
}
`);
  execFileSync(process.execPath, ["src/cli.ts", "build", dir, "--prerender", "--site", "https://x.example"], { stdio: "pipe" });
  const home = readFileSync(join(dir, "dist", "index.html"), "utf8");
  assert.match(home, /<div class="a-column" id="box" style="gap:8px;--d: 40ms">/);
  assert.match(home, /<h1 class="hero big">Hello<\/h1>/, "a dynamic class is in the static HTML");
  assert.match(home, /<form class="a-column" novalidate/);
  assert.match(home, /<link rel="icon" href="\/favicon.svg">/);
  assert.match(home, /property="og:image" content="https:\/\/x.example\/og.png"/);
  assert.match(readFileSync(join(dir, "dist", "404.html"), "utf8"), /Nothing here/);
});
