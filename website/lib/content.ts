// Everything the site shows that already lives in the repository (the spec, guides, README results,
// examples, the error catalog, this site's own .art files) comes from here, imported as text at
// build time: one source of truth for people, AI agents and the docs.
import readme from "../../README.md" with { type: "text" };
import spec from "../../docs/SPEC.md" with { type: "text" };
import editSpec from "../../docs/SPEC-EDIT.md" with { type: "text" };
import coreSpec from "../../docs/SPEC-CORE.md" with { type: "text" };
import deploy from "../../docs/DEPLOY.md" with { type: "text" };
import security from "../../SECURITY.md" with { type: "text" };
import status from "../../docs/STATUS.md" with { type: "text" };
import introduction from "../content/introduction.md" with { type: "text" };
import quickStart from "../content/quick-start.md" with { type: "text" };
import tutorial from "../content/tutorial.md" with { type: "text" };
import components from "../content/components.md" with { type: "text" };
import routing from "../content/routing.md" with { type: "text" };
import backend from "../content/backend.md" with { type: "text" };
import auth from "../content/auth.md" with { type: "text" };
import styling from "../content/styling.md" with { type: "text" };
import testing from "../content/testing.md" with { type: "text" };
import libraries from "../content/libraries.md" with { type: "text" };
import agents from "../content/agents.md" with { type: "text" };
import cli from "../content/cli.md" with { type: "text" };
import recipes from "../content/recipes.md" with { type: "text" };
import exCounter from "../../examples/counter/app.art" with { type: "text" };
import exTodo from "../../examples/todo/app.art" with { type: "text" };
import exBlog from "../../examples/blog/app.art" with { type: "text" };
import exUsers from "../../examples/users/app.art" with { type: "text" };
import exNotes from "../../examples/notes/app.art" with { type: "text" };
import exCatalog from "../../examples/catalog/app.art" with { type: "text" };
import exCrm from "../../examples/crm/app.art" with { type: "text" };
import srcSite from "../site.art" with { type: "text" };
import srcHome from "../home.art" with { type: "text" };
import srcDocs from "../docs.art" with { type: "text" };
import srcReference from "../reference.art" with { type: "text" };
import srcAi from "../ai.art" with { type: "text" };
import srcPlayground from "../playground.art" with { type: "text" };
import srcBenchmarks from "../benchmarks.art" with { type: "text" };
import srcExamples from "../examples.art" with { type: "text" };
import srcSource from "../source.art" with { type: "text" };
import srcCss from "../site.css" with { type: "text" };
import cmpArt from "../../benchmarks/eval/refs/fs-users/artscript/app.art" with { type: "text" };
import cmpReact from "../../benchmarks/eval/refs/fs-users/react/App.tsx" with { type: "text" };
import cmpReactServer from "../../benchmarks/eval/refs/fs-users/react/server.ts" with { type: "text" };
import cmpSvelte from "../../benchmarks/eval/refs/fs-users/svelte/App.svelte" with { type: "text" };
import cmpSvelteServer from "../../benchmarks/eval/refs/fs-users/svelte/server.ts" with { type: "text" };
import cmpVue from "../../benchmarks/eval/refs/fs-users/vue/App.vue" with { type: "text" };
import cmpVueServer from "../../benchmarks/eval/refs/fs-users/vue/server.ts" with { type: "text" };
import cmpSolid from "../../benchmarks/eval/refs/fs-users/solid/App.tsx" with { type: "text" };
import cmpSolidServer from "../../benchmarks/eval/refs/fs-users/solid/server.ts" with { type: "text" };
import agentsTemplate from "../../templates/default/AGENTS.md" with { type: "text" };
import { CATALOG } from "../../src/errors.ts";
import { ELEMENTS } from "../../src/elements.ts";
import { headings, markdown, REPO } from "./markdown.ts";
// @ts-ignore: runtime is plain JS
import { withBase } from "../../runtime/runtime.js";

export { REPO };
export const SITE = "https://artscript.dev";

// The example apps in apps/, published as static demos under /demos.
export const DEMOS = [
  { path: "shop", app: "shop", title: "Fernwood, a shop", summary: "Catalog, cart, accounts, a checkout priced and stock-checked by a server fn, order history and an admin." },
  { path: "backoffice", app: "backoffice", title: "Northwind, a backoffice", summary: "A dashboard with Chart.js over server-side aggregates, and orders, customers and products with server-side search, sort and pages." },
  { path: "brisa", app: "landing", title: "Brisa, a landing page", summary: "A prerendered landing page with CSS animations, light and dark, a pricing toggle and an FAQ." },
];
export const lines = (s: string) => s.trimEnd().split("\n").length;

// ---------- docs ----------
export type Doc = { slug: string; path: string; title: string; section: string; source: string; md: string };

const doc = (slug: string, path: string, title: string, section: string, source: string, md: string): Doc => ({ slug, path, title, section, source, md });

export const DOCS: Doc[] = [
  doc("introduction", "/learn", "Introduction", "Learn", "website/content/introduction.md", introduction),
  doc("quick-start", "/learn/quick-start", "Quick start", "Learn", "website/content/quick-start.md", quickStart),
  doc("tutorial", "/learn/tutorial", "Tutorial: a full-stack app", "Learn", "website/content/tutorial.md", tutorial),
  doc("components", "/learn/components", "Components and state", "Learn", "website/content/components.md", components),
  doc("routing", "/learn/routing", "Pages and routing", "Learn", "website/content/routing.md", routing),
  doc("backend", "/learn/backend", "Data and backend", "Learn", "website/content/backend.md", backend),
  doc("auth", "/learn/auth", "Accounts and access", "Learn", "website/content/auth.md", auth),
  doc("styling", "/learn/styling", "Styling and themes", "Learn", "website/content/styling.md", styling),
  doc("testing", "/learn/testing", "Testing", "Learn", "website/content/testing.md", testing),
  doc("libraries", "/learn/libraries", "JavaScript libraries", "Learn", "website/content/libraries.md", libraries),
  doc("recipes", "/learn/recipes", "Recipes", "Learn", "website/content/recipes.md", recipes),
  doc("deploy", "/learn/deploy", "Deploying", "Learn", "docs/DEPLOY.md", deploy),
  doc("agents", "/ai/agents", "Working with AI agents", "For AI", "website/content/agents.md", agents),
  doc("spec", "/reference/spec", "Language spec", "Reference", "docs/SPEC.md", spec),
  doc("edit", "/reference/edit", "Edit spec", "Reference", "docs/SPEC-EDIT.md", editSpec),
  doc("core", "/reference/core", "Core spec", "Reference", "docs/SPEC-CORE.md", coreSpec),
  doc("cli", "/reference/cli", "CLI", "Reference", "website/content/cli.md", cli),
  doc("security", "/reference/security", "Security", "Reference", "SECURITY.md", security),
  doc("status", "/status", "Status", "Project", "docs/STATUS.md", status),
];

export type NavItem = { title: string; path: string };
export type NavSection = { title: string; items: NavItem[] };

const item = (title: string, path: string): NavItem => ({ title, path });
export const NAV: NavSection[] = [
  { title: "Learn", items: DOCS.filter((d) => d.section === "Learn").map((d) => item(d.title, d.path)) },
  { title: "For AI", items: [item("Overview", "/ai"), item("Working with AI agents", "/ai/agents"), item("Core spec", "/reference/core"), item("Edit spec", "/reference/edit")] },
  { title: "Reference", items: [item("Language spec", "/reference/spec"), item("UI elements", "/reference/elements"), item("Errors", "/reference/errors"), item("CLI", "/reference/cli"), item("Security", "/reference/security")] },
  { title: "Project", items: [item("Status", "/status"), item("Examples", "/examples"), item("Benchmarks", "/benchmarks"), item("Playground", "/playground"), item("This site's source", "/source")] },
];

export const docBySlug = (s: string): Doc => DOCS.find((d) => d.slug === s) ?? DOCS[0];
export const renderDoc = (s: string): string => markdown(docBySlug(s).md, { skipTitle: true });
export const docHeadings = (s: string) => headings(docBySlug(s).md);
export const docFile = (s: string) => `/md/${docBySlug(s).source.split("/").pop()}`;
export const editUrl = (s: string) => `${REPO}/edit/main/${docBySlug(s).source}`;

// Previous and next page in the reading order of the sidebar.
const ORDER = NAV.flatMap((s) => s.items).filter((x, i, all) => all.findIndex((y) => y.path === x.path) === i);
export const prevPage = (path: string): NavItem | null => ORDER[ORDER.findIndex((x) => x.path === path) - 1] ?? null;
export const nextPage = (path: string): NavItem | null => {
  const i = ORDER.findIndex((x) => x.path === path);
  return i >= 0 ? ORDER[i + 1] ?? null : null;
};

// Rough token count (≈ 4 characters per token for English and code).
export const tokens = (s: string) => Math.round(s.length / 4 / 100) * 100;
export const specTokens = tokens(spec);
export const editTokens = tokens(editSpec);
export const coreTokens = tokens(coreSpec);
export const specText = spec;

// The one prompt to paste into any agent: it sets up a project and tells the model where the
// language is described and how to work (the same loop AGENTS.md describes).
export const AI_PROMPT = `Build this with ArtScript (https://artscript.dev), a full-stack web language designed for AI agents.

Setup (skip what already exists):
1. \`npm create artscript@latest my-app && cd my-app && npm install\`
2. If you support MCP, register the server: \`claude mcp add artscript -- npx art mcp\` (Claude Code) or add {"command":"npx","args":["art","mcp"]} to your MCP config. It gives you art_spec, art_check, art_context and art_patch as tools.

Before writing any .art code, read ARTSCRIPT-CORE.md in the project (or https://artscript.dev/md/SPEC-CORE.md, ~1,600 tokens: the structure with a whole app as the example); ARTSCRIPT.md (https://artscript.dev/md/SPEC.md) is the full reference when you need the backend, accounts or relations in detail. To change existing code, ARTSCRIPT-EDIT.md (~800 tokens) is enough.

How to work:
- Expressions are JavaScript; only the structure (page, component, model, api, state, computed, data, fn, the view) is ArtScript's own.
- Heavy imperative code (a physics loop, a parser, canvas drawing) goes in a .ts file next to the .art files, imported with \`use "./sim.ts" { step, draw }\`: plain TypeScript, no restrictions. ArtScript is for the page, the state, the api, forms, lists and tests.
- After every change run \`npx art check --ai\`: one JSON line per error, each with expected, actual and fixes. Apply the fix; don't guess.
- Read \`npx art context <Component>\` instead of whole files; prefer a small \`npx art patch\` over rewriting files.
- Write test "..." { } blocks for the main flows and run \`npx art test\`.
- Format with \`npx art fmt --write\`, run with \`npm run dev\`, ship with \`npx art build\`.

Now: `;
export const AGENTS_MD = agentsTemplate;
export const editText = editSpec;
export const coreText = coreSpec;

// ---------- benchmarks (from the README, written by the eval) ----------
export type StackResult = { stack: string; solved: string; usd: number; vsReact: string; ours: boolean };
export type ModelResult = { id: string; name: string; headline: string; rows: StackResult[] };

const MODEL_NAMES: Record<string, string> = { "claude-opus-5-5": "Claude Opus 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-haiku-4-5": "Claude Haiku 4.5" };
const evalSection = readme.split("## Cost eval results")[1]?.split("<!-- eval-results:end -->")[0] ?? "";

export const RESULTS: ModelResult[] = evalSection.split("\n### ").slice(1)
  .filter((block) => !block.startsWith("Methodology"))
  .map((block) => {
    const id = block.split(" ")[0].trim();
    // The first table of each model: | Stack | Solved | USD per solved task | vs React | ...
    const all = block.split("\n");
    const start = all.findIndex((l) => l.startsWith("| Stack | Solved"));
    const rows: StackResult[] = [];
    for (let i = start + 2; start >= 0 && all[i]?.startsWith("|"); i++) {
      const c = all[i].slice(1, -1).split("|").map((x) => x.trim().replace(/\*\*/g, ""));
      rows.push({ stack: c[0], solved: c[1], usd: parseFloat(c[2].slice(1)), vsReact: c[3], ours: c[0] === "ArtScript" });
    }
    // The headline is the all-tasks figure from the summary table, not the first scenario's.
    const summary = new RegExp(`^\\| ${id} \\|.*\\*\\*−(\\d+)%\\*\\* \\|$`, "m").exec(evalSection);
    const headline = summary?.[1] ?? (/ArtScript cost \*\*(\d+)% less\*\* per solved task than React \+ TS/.exec(block) ?? [])[1] ?? "";
    return { id, name: MODEL_NAMES[id] ?? id, headline, rows };
  })
  .filter((m) => m.rows.length);

export const barWidth = (rows: StackResult[], usd: number) => `${Math.max(4, (usd / Math.max(...rows.map((r) => r.usd))) * 100).toFixed(1)}%`;
export const resultsHtml = markdown(evalSection.replace(/^### Methodology[\s\S]*$/m, ""));

const PLAIN_STACKS: Record<string, string> = { artscript: "ArtScript", react: "React + TS", svelte: "Svelte 5", vue: "Vue 3", solid: "SolidJS" };
// The imperative task's table (a canvas with physics), reported apart in the README: one row per model.
export type ImperativeRow = { model: string; cells: { stack: string; usd: string; ours: boolean }[]; vsReact: string };
export const IMPERATIVE: ImperativeRow[] = (evalSection.split("\n### Imperative code")[1] ?? "").split("\n### ")[0].split("\n")
  .filter((l) => l.startsWith("| claude-"))
  .map((l) => {
    const c = l.slice(1, -1).split("|").map((x) => x.trim().replace(/\*\*/g, ""));
    const stacks = ["artscript", "react", "svelte", "vue", "solid"];
    return { model: MODEL_NAMES[c[0]] ?? c[0], cells: stacks.map((s, i) => ({ stack: PLAIN_STACKS[s], usd: c[i + 1], ours: s === "artscript" })), vsReact: c[6] };
  });

export const methodologyHtml = markdown(evalSection.split("### Methodology and limitations")[1] ?? "");

// ---------- the same full-stack app in every stack (the eval's fs-users reference answers) ----------
export type Stack = { name: string; code: string; lang: string; files: string; tokens: number; lines: number };
const stack = (name: string, lang: string, files: [string, string][]): Stack => {
  const code = files.length === 1 ? files[0][1] : files.map(([f, src]) => `// ---- ${f} ----\n${src.trimEnd()}`).join("\n\n");
  return { name, code, lang, files: files.map(([f]) => f).join(" + "), tokens: Math.round(code.length / 4), lines: lines(code) };
};
export const COMPARE: Stack[] = [
  stack("ArtScript", "art", [["app.art", cmpArt]]),
  stack("React", "tsx", [["App.tsx", cmpReact], ["server.ts", cmpReactServer]]),
  stack("Svelte", "svelte", [["App.svelte", cmpSvelte], ["server.ts", cmpSvelteServer]]),
  stack("Vue", "vue", [["App.vue", cmpVue], ["server.ts", cmpVueServer]]),
  stack("SolidJS", "tsx", [["App.tsx", cmpSolid], ["server.ts", cmpSolidServer]]),
];
export const stackByName = (n: string): Stack => COMPARE.find((s) => s.name === n) ?? COMPARE[1];
export const resultFor = (model: string) => RESULTS.find((m) => m.id === model) ?? RESULTS[0];

// ---------- examples ----------
export type Example = { name: string; title: string; summary: string; src: string; runs: boolean; features: string[] };
const strip = (src: string) => src.replace(/\ntest "[\s\S]*$/, "\n");
export const EXAMPLES: Example[] = [
  { name: "counter", title: "Counter", summary: "State, a computed value and events in ten lines.", src: strip(exCounter), runs: true, features: ["state", "computed", "events"] },
  { name: "todo", title: "Todo list", summary: "Lists, input binding, filters and components.", src: strip(exTodo), runs: true, features: ["for", "input", "components"] },
  { name: "blog", title: "Blog", summary: "Pages with routes, a layout, params and meta tags.", src: strip(exBlog), runs: false, features: ["routes", "layout", "meta"] },
  { name: "users", title: "Users CRUD", summary: "A full-stack CRUD: model, REST api and data that reloads itself.", src: strip(exUsers), runs: false, features: ["model", "api", "data"] },
  { name: "notes", title: "Private notes", summary: "Accounts, per-user data and a server function.", src: strip(exNotes), runs: false, features: ["auth", "private", "server fn"] },
  { name: "catalog", title: "Product catalog", summary: "Admin role, search, sorting and pagination.", src: strip(exCatalog), runs: false, features: ["admin", "search", "pagination"] },
  { name: "crm", title: "Mini CRM", summary: "Relations, file uploads, live data and a modal.", src: strip(exCrm), runs: false, features: ["relations", "uploads", "live"] },
];
export const exampleByName = (n: string): Example => EXAMPLES.find((e) => e.name === n) ?? EXAMPLES[0];

// ---------- reference tables from the compiler itself ----------
export const ERRORS = Object.entries(CATALOG).map(([type, e]) => ({ type, code: e.code, desc: e.desc })).sort((a, b) => a.code.localeCompare(b.code));
export const ELEMENT_ROWS = Object.entries(ELEMENTS).map(([name, e]) => ({
  name,
  html: e.html,
  content: e.content === "bind" ? "state to bind" : e.content === "src" ? "source URL" : e.content ?? "—",
  action: e.action ?? "—",
  children: e.children ? "yes" : "—",
  props: e.props.filter((p) => !["class", "style", "id", "ref"].includes(p)).join(" ") || "—",
  flags: e.flags.join(" ") || "—",
}));

// ---------- this site's source ----------
export type SourceFile = { file: string; what: string; src: string; lang: string };
export const SOURCE: SourceFile[] = [
  { file: "website/site.art", what: "Layout, navigation, footer and shared components (Code, Markdown, DocPage)", src: srcSite, lang: "art" },
  { file: "website/home.art", what: "This home page", src: srcHome, lang: "art" },
  { file: "website/docs.art", what: "Every guide and spec page", src: srcDocs, lang: "art" },
  { file: "website/reference.art", what: "UI elements and errors, read from the compiler", src: srcReference, lang: "art" },
  { file: "website/ai.art", what: "The For AI page", src: srcAi, lang: "art" },
  { file: "website/playground.art", what: "The playground (the compiler running in your browser)", src: srcPlayground, lang: "art" },
  { file: "website/benchmarks.art", what: "Benchmarks, charted from the README's results", src: srcBenchmarks, lang: "art" },
  { file: "website/examples.art", what: "The examples gallery", src: srcExamples, lang: "art" },
  { file: "website/source.art", what: "This page", src: srcSource, lang: "art" },
  { file: "website/site.css", what: "The theme and the page layouts", src: srcCss, lang: "css" },
];
export const artFiles = SOURCE.filter((f) => f.lang === "art");
export const artLines = artFiles.reduce((n, f) => n + lines(f.src), 0);
export const sourceByFile = (f: string): SourceFile => SOURCE.find((s) => s.file === f) ?? SOURCE[0];

// ---------- browser bits ----------
export const prefersDark = () => (globalThis as any).matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

// The icon and the AI-readable alternates go in <head> (prerendered too).
export function setupHead() {
  if (document.getElementById("site-icon")) return;
  const link = (id: string, attrs: Record<string, string>) => {
    const l = document.createElement("link");
    l.setAttribute("id", id);
    for (const [k, v] of Object.entries(attrs)) l.setAttribute(k, v);
    document.head.appendChild(l);
  };
  const base = (p: string) => withBase(p);
  link("site-icon", { rel: "icon", type: "image/svg+xml", href: base("/favicon.svg") });
  link("site-llms", { rel: "alternate", type: "text/plain", title: "llms.txt", href: base("/llms.txt") });
}
