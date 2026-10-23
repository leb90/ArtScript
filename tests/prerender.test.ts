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
  assert.match(readFileSync(join(dist, "sitemap.xml"), "utf8"), /<loc>https:\/\/blog.example\/<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>[\s\S]*<loc>https:\/\/blog.example\/about\/<\/loc>/);
  // The address a static host serves without a redirect, for search engines and link previews.
  assert.match(home, /<link rel="canonical" href="https:\/\/blog.example\/"><meta property="og:url" content="https:\/\/blog.example\/"><meta property="og:type" content="website"><meta name="twitter:card" content="summary">/);
  assert.match(readFileSync(join(dist, "about", "index.html"), "utf8"), /<link rel="canonical" href="https:\/\/blog.example\/about\/">/);
  assert.match(readFileSync(join(dist, "robots.txt"), "utf8"), /Sitemap: https:\/\/blog.example\/sitemap.xml/);
  assert.doesNotMatch(readFileSync(join(dist, "_app.html"), "utf8"), /Hello, ArtScript/, "the fallback shell is empty");

  GlobalRegistrator.register({ url: "http://localhost/" });
  try {
    const [, head, body] = /<head>(.*)<\/head><body>(.*)<script/.exec(home)!;
    document.head.innerHTML = head.replace(/ href="[^"]*app\.css"/, ""); // (happy-dom would fetch it)
    document.body.innerHTML = body;
    await import(pathToFileURL(join(dist, "app.js")).href);
    await new Promise((ok) => setTimeout(ok, 20));
    const text = document.getElementById("app")!.textContent!;
    assert.equal(text.match(/Hello, ArtScript/g)!.length, 1);
    assert.equal(document.querySelectorAll("#art-css").length, 1, "the styles come as app.css, linked once");
    assert.equal(document.querySelectorAll("style#art-css").length, 0, "no inline style element (a strict CSP works)");
  } finally {
    await GlobalRegistrator.unregister();
  }
});

test("prerender: styles written as text, browser-only code in mount, 404.html, favicon and an absolute og:image", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-pre2-"));
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "public", "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(dir, "styles.css"), '@import url("https://fonts.example/css2?family=Inter");\nbody { color: red }\n');
  writeFileSync(join(dir, "app.art"), `page Home "/" {
  state big = true
  ref cv
  meta title="Home" image="/og.png"
  mount {
    document.documentElement.style.setProperty("--x", "1")
    window.matchMedia("(min-width: 1px)").addEventListener("change", () => null)
    matchMedia("(prefers-reduced-motion)").matches
    cv.getContext("2d")?.fillRect(0, 0, 1, 1)
    requestAnimationFrame(() => null)
    await Promise.reject(new Error("browser only"))
  }

  column gap=2 style="--d: 40ms" id="box" {
    title "Hello" tag=h1 class=(big ? "hero big" : "hero")
    canvas ref=cv
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
  assert.match(home, /<h1 class="a-title hero big">Hello<\/h1>/, "a dynamic class is in the static HTML");
  assert.match(home, /<form class="a-column" novalidate/);
  assert.match(home, /<link rel="icon" href="\/favicon.svg">/);
  assert.match(home, /property="og:image" content="https:\/\/x.example\/og.png"/);
  assert.match(readFileSync(join(dir, "dist", "404.html"), "utf8"), /Nothing here/);
  assert.doesNotMatch(readFileSync(join(dir, "dist", "404.html"), "utf8"), /rel="canonical"/, "the not-found page isn't indexed as an address");
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  // The mount's async failure and browser-only calls didn't stop the build; @import comes first in app.css.
  assert.match(readFileSync(join(dir, "dist", "app.css"), "utf8"), /^@import url\("https:\/\/fonts.example[^\n]*;\n@layer art\{/);
});

test("prerender: with --base and --site, og:image has the base once", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-pre3-"));
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "public", "og.png"), "png");
  writeFileSync(join(dir, "app.art"), 'page Home "/" {\n  meta title="Home" image="/og.png"\n  text "hi"\n}\n');
  execFileSync(process.execPath, ["src/cli.ts", "build", dir, "--prerender", "--base", "/club", "--site", "https://x.example/club"], { stdio: "pipe" });
  const home = readFileSync(join(dir, "dist", "index.html"), "utf8");
  assert.match(home, /property="og:image" content="https:\/\/x.example\/club\/og.png"/);
  assert.match(home, /rel="canonical" href="https:\/\/x.example\/club\/"/);
});

test("prerender: a page's language, Open Graph tags with the image's size, JSON-LD from the app's data, head.html, image and form attributes", () => {
  const dir = mkdtempSync(join(tmpdir(), "art-pre4-"));
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "public"));
  // A 3×2 PNG: only its header is read.
  const png = Buffer.alloc(33);
  png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(0x0d0a1a0a, 4); png.writeUInt32BE(13, 8); png.write("IHDR", 12); png.writeUInt32BE(3, 16); png.writeUInt32BE(2, 20);
  writeFileSync(join(dir, "public", "og.png"), png);
  writeFileSync(join(dir, "head.html"), '<meta name="google-site-verification" content="abc">\n');
  writeFileSync(join(dir, "src", "app.art"), `const ITEMS = ["Chipa", "Mate"]

page Home "/" {
  meta title="Club" image="/og.png" imageAlt="Una bandeja" siteName="Club" locale="es_ES" lang="es" themeColor="#b45309" jsonld=({ "@type": "ItemList", items: ITEMS, note: "</script>" })
  state phone = ""

  title tag=h1 {
    text "Somos tu "
    text "club" class="hl"
  }
  image "/og.png" alt="Chipas" loading=lazy decoding=async fetchpriority=low
  input phone placeholder="Teléfono" type=tel autocomplete="tel" inputmode=tel name="phone"
}

page About "/about" {
  meta title="About" lang="en"
  text "About"
}
`);
  execFileSync(process.execPath, ["src/cli.ts", "build", dir, "--prerender", "--base", "/club", "--site", "https://x.example/club"], { stdio: "pipe" });
  const home = readFileSync(join(dir, "dist", "index.html"), "utf8");
  assert.match(home, /^<!doctype html><html lang="es">/);
  assert.match(readFileSync(join(dir, "dist", "about", "index.html"), "utf8"), /<html lang="en">/);
  assert.match(readFileSync(join(dir, "dist", "_app.html"), "utf8"), /<html lang="en">/, "pages disagree: the shell keeps en");
  for (const tag of ['property="og:image:alt" content="Una bandeja"', 'property="og:site_name" content="Club"', 'property="og:locale" content="es_ES"', 'name="theme-color" content="#b45309"', 'property="og:image:width" content="3"', 'property="og:image:height" content="2"', 'name="google-site-verification" content="abc"']) {
    assert.ok(home.includes(tag), tag);
  }
  const json = /<script type="application\/ld\+json" data-art-jsonld="">(.*?)<\/script>/.exec(home)![1];
  assert.deepEqual(JSON.parse(json), { "@type": "ItemList", items: ["Chipa", "Mate"], note: "</script>" });
  assert.doesNotMatch(json, /<\/script>/, "the data can't close the script");
  assert.match(home, /<h1 class="a-title"><span>Somos tu <\/span><span class="hl">club<\/span><\/h1>/);
  assert.match(home, /<img alt="Chipas" loading="lazy" decoding="async" fetchpriority="low"/);
  assert.match(home, /<input [^>]*autocomplete="tel" inputmode="tel" name="phone"/);
});
