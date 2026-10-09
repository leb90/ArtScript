# Changelog

ArtScript follows [semantic versioning](https://semver.org) from 1.0. Before 1.0, a minor version (0.x) may change the syntax; every change of that kind is listed here with what to write instead.

## Unreleased

- Checker: an `api`, `server` or `auth` call inside `try` without `await` is the error NOT_AWAITED with the fix (its rejection would skip the `catch`). A page may name a state `query` or `params`. `input` takes `type=search|tel|url|color|range|time|datetime-local|month|week` too.
- The core spec's main example is a plain app (local state), with the server version as the next step; it also spells out accounts (`api users` + `auth users`), `await` inside `try`, the test steps and what a `File` field holds. In the eval, an app that declares an `api` gets its server whether or not the task is full-stack, as `art dev` would.

## 0.2.10 (2026-10-09)

- New projects get `ARTSCRIPT-CORE.md` (`docs/SPEC-CORE.md`, ~1,600 tokens): the structure of the language with a whole app as the example, what the agent instructions now say to read first; `ARTSCRIPT.md` stays the full reference. Together with an explicit rule in `AGENTS.md`, the Cursor rule and the Claude Code skill (heavy imperative code goes in a `.ts` file imported with `use`), the imperative task of the cost eval went from costing 37–83% more than React to parity or less with the three models, at the first attempt and with React-level thinking (see the benchmarks page). The 50-task tables were measured with the full spec and are not re-measured.
- The eval takes `--spec-file <path>` and `--art-rules <path>` to measure other specs and project rules.

## 0.2.9 (2026-10-09)

- Guidance, in the spec, `AGENTS.md`, the Cursor rule, the Claude Code skill and the site's prompt: heavy imperative code (a physics loop, a parser, canvas drawing) goes in a `.ts` or `.js` file imported with `use`, where it is plain JavaScript with no restrictions; ArtScript is for what it shortens (pages, state, the api, forms, lists, tests). The status page says where the saving is and where it isn't.
- The cost eval has an imperative task (`imp-particles`: a canvas with gravity, walls and elastic collisions), reported in its own table, so that case has a number too. The simulated browser now gives canvases a recording 2D context and paces `requestAnimationFrame` at 60 fps.

## 0.2.8 (2026-10-09)

- Fixed: assigning a field of a `fn` parameter or of a computed's item (`fn move(d) { d.x++ }`) notified every state of the app on every assignment, which re-ran every effect; in a loop that runs per frame it froze the page. Now the runtime notifies only the states that hold the mutated object, once per flush, and an object no state holds (a local of a physics loop) notifies nothing.
- `art fmt` keeps long objects, arrays and calls readable: one entry per line past 100 columns (a list of plain values fills each line), and an arrow with several statements always breaks over lines. Before, a 10,000-character dictionary ended up on one line.
- `art patch` rewrites only the files an operation changed; the others are left exactly as they are.
- `art build --prerender` and server rendering: a `mount` that fails asynchronously, or that uses `canvas.getContext`, `matchMedia`, `requestAnimationFrame`, observers or `getComputedStyle`, no longer stops the build (inert stand-ins on the server).
- `@import` and `@charset` in a project's CSS are lifted to the top of `app.css`, where CSS requires them (a Google Fonts import was silently ignored).
- Checker: typed arrays (`Uint8Array`...) and other browser globals are known; `tabindex` is accepted on any element; a `let` arrow may call itself (`let tick = () => requestAnimationFrame(tick)`); `tag=` takes `pre`, `code`, `kbd`, `dl`, `dt`, `dd`, `ul`, `ol`, `li`, `details`, `summary` and a few more.
- New projects have `@happy-dom/global-registrator` in their devDependencies, so `art test` works out of the box.
- `break` and `continue` in loops (`break` outside one is the error BREAK_OUTSIDE_LOOP), and the bitwise operators `& | ^ ~ << >> >>>` with their compound assignments. Number literals keep the form they were written in (`0xff`, `1e3`).
- The spec says that `fn`, `let` and `ref` compile to plain JavaScript and that a `let` member is a `computed`.
- New projects recommend the ArtScript extension for VS Code and Cursor (`.vscode/extensions.json`): the editor offers to install it when the project is opened. The extension (0.2.7, `editors/vscode`) now has file icons for `.art`, snippets, and highlighting for every element.

## 0.2.7 (2026-10-07)

- Lists render faster and use less memory. A `for` whose rows are elements, text and bindings (no `if`, nested list, component or icon inside) is compiled to a template built once and cloned per row, so rows share their attributes in the browser and cost one call instead of one per node. In the runtime: a row's effects keep their sources in a field instead of a Set, scopes link what they dispose instead of holding an array, single-element rows need no marker comments or fragment of their own, new rows next to each other go into the page in one insertion, text bindings are an effect with no closure around them, and click handlers are delegated to one listener on the document (a list of thousands of rows registers none; `event.currentTarget` is still the element). Measured with js-framework-benchmark's harness against Solid on the same machine: memory after creating 1,000 rows 3.39 → 2.7 MB (Solid 2.7), creating 10,000 rows 1.20× Solid → 1.05×, clearing rows now faster than Solid.
- Disposal of a scope runs last-registered first.

## 0.2.6 (2026-10-03)

- README on npm: the current status (it still said "v0.1, MVP foundation"), the one-prompt start and the author. No code changes.

## 0.2.5 (2026-10-03)

- Every scalar field of a model gets an index (and `owner` for private apis), created on start and dropped when the field goes. `where`, `sort`, `unique` checks and private scopes no longer scan the table: measured on 64,000 rows, an insert with a `unique` field went from 3.3 ms (growing with the table) to 0.3 ms (constant); `where` and `sort` answer in 2 ms. `search` still scans (it is a LIKE).
- The session cookie is `Secure` when the request came over HTTPS (`x-forwarded-proto: https` from the proxy, or TLS on the server itself).
- `use "./x.ts"` where `x.ts` imports a package that isn't installed: the error names the package and the fix is `npm install <package>`, instead of "module './x.ts' not found".
- New projects get a Claude Code skill (`.claude/skills/artscript/SKILL.md`) next to `AGENTS.md`, `CLAUDE.md` and the Cursor rule.

## 0.2.4 (2026-10-03)

- The runtime's styles ship in `app.css` (first, in their cascade layer) instead of a `<style>` added by JavaScript: the first paint has them, and an app with a strict `style-src 'self'` policy works when it uses no responsive props or `style { }` blocks (those still add rules at runtime). js-framework-benchmark's CSP check passes.
- `link ... target="_blank"`; `meta image=` gets the app's base path.

## 0.2.3 (2026-10-02)

- `art build --demo`: a full-stack app published as static files. The api, accounts and server fns are bundled in and run in the visitor's browser with the server's rules (validation, access, relations, `private`, `readonly`, jobs), keeping the data in that browser. For demos and examples on any static host, with no server to pay for; `art build` still makes the real one. Tests send the same requests to the server and to the demo backend and compare the answers.

## 0.2.2 (2026-10-02)

- Fixed (a 0.2.1 regression): a dynamic `class=(expr)` was missing from prerendered and server-rendered HTML.
- `h1`–`h6` and `p` (from `tag=`) have no default margin, like `title`; `novalidate` is in the static HTML; the build's size table shows the prerendered pages.
- A `title` looks the same whatever its `tag=` (`title "Orders" tag=h1`).
- `server job`: when each job last ran is stored, so on a server that restarts or sleeps an `every "1d"` job still runs once a day (it used to wait a full interval after every start).
- `art test`: `see`/`notSee` ignore what is `aria-hidden`; `link` finds links by their `aria-label` too. `globalThis` is known to the checker.

## 0.2.1 (2026-10-02)

From building three apps with the published package (a shop, a backoffice, a landing page):

- `aria-*` and `data-*` on any element (`button "Menu" aria-expanded=open`), and `tag=` on texts and containers for the HTML element (`title "Plans" tag=h1`, `column tag=nav`). `form ... novalidate`.
- The runtime's base styles and the rules of responsive props are in a cascade layer (`@layer art`): any rule of your own CSS wins, whatever its specificity (before, `.footer-grid { grid-template-columns: ... }` lost to `md:cols=4`, and `:root { --a-bg: ... }` to the dark theme).
- Fixed: `style="..."` together with `gap`/`pad` crashed (and replaced the element's styles; it now adds to them); prerender wrote a string `style` as garbage; browser-only code in `mount` (an observer, `matchMedia`) aborted `art build --prerender`; a `class` on `icon` dropped its own class; links to a section of the current page (`/#plans`) were marked `aria-current`.
- Shared state: `state`, `computed` and `fn` written outside any component are one value for the whole app (a cart every page sees).
- `api orders: Order private readonly`: clients only read, server fns write (an order's total can't be forged over REST).
- Regular expressions (`/^\d+$/.test(x)`), computed keys (`{ [field]: msg }`), `try { } finally { }` without `catch`, `canvas`, `step`/`min`/`max` on `input`, `bold` on `td`, `matchMedia` and the observers known to the checker. A `ref` can be assigned (to keep a chart instance).
- Fixed: a closed `modal` with `gap` was visible; a custom `class` removed `primary`/`small`/`muted`, and written after responsive props it removed theirs; `art test` crashed when a server fn used a local module; a page behind `requires login` now goes to `/login?next=<where>`; `data x = server.fn()` of a list starts as `[]`.
- `art test`: `click`, `link` and `fill` wait for what they act on, buttons without text are found by their `aria-label`, and failures show more of the screen.
- `art build --prerender` writes `404.html` (the `"*"` page), links `public/favicon.*` from every page, and with `--site` makes `og:image` absolute.

## 0.2.0 (2026-10-02)

### Language
- `use` for npm packages and your own JS/TS modules, checked at compile time.
- Real routes: `page X "/products/:id"` with typed `params`, `query`, `"*"`, layouts with `slot`, `navigate()`.
- UI elements: `select`, `radio`, `tabs`, `checkbox`, `textarea`, `file`, `modal`, `table`, `list`, `badge`, `spinner`, `divider`, `video`, `audio`, `icon` (Lucide), `meta`; `label=` on inputs; `notify()` toasts.
- `on:<event>`, `ref`, `mount`, `effect`, `cleanup`; component children with `slot` and named slots; typed callbacks `Fn(User)`.
- Keyed lists (`for p in xs key p.id`) that keep their DOM; responsive props (`md:cols=3`).
- Assignable `computed`, two-way props, mutations through parameters update the screen, TS-style annotations and defaults accepted in params.
- `test "..." { ... }` blocks run by `art test`; steps find inputs by placeholder or label.
- Layouts inside layouts (`layout Docs layout Site`); a slot inside an `if` renders its page when it appears. Links to the current page get `aria-current="page"`.
- Accessibility: `role` on any element (`column role="main"`); a field without `label=` gets its `placeholder` as its accessible name. The website scores 100 in Lighthouse accessibility, SEO, best practices and agentic browsing.
- `link` takes children (a clickable card: `link to="/p/1" { card { ... } }`); `table` rows go in a `<tbody>`; an element's text next to its children updates without removing them; `link on:click=...` with no text parses.
- Faster updates: bindings write the DOM only when their value changed, and keyed lists move only the rows outside the longest unchanged run (a swap moves two rows, not all of them).
- Faster in-place updates: a callback over a state (`rows.forEach(r => r.done = true)`) notifies that state once instead of every state per item, and a list whose rows stayed in place skips reconciling ("update every 10th row" in js-framework-benchmark: 26.7 → 13 ms, 1.1× Solid).
- A row of a `computed` changed in place (`for t in open { button "x" -> t.done = true }`) now updates the state it came from.
- `table` renders inside a block of its own: a wide table scrolls sideways instead of stretching the page, and Chrome lays it out faster than as a direct child of a `column` or `card`. An empty `text ""` (an icon-font class) gets `aria-hidden="true"`.
- `for x in xs { }` (and `for x, i in xs`) in functions and actions; JavaScript's `for (const x of xs)` and `for (let i = 0; i < n; i++)` are accepted too.
- Accepted as models write them (from the pilot of the 1.0 measurement; `art fmt` writes the canonical form): lists and objects with one item per line and no commas, `fn save { }`, `let x = ...` in a component (a `computed`), `ref timer = null` (a `state`), `computed x = { ...statements }`, the content after a prop (`image alt="x" user.photo`), `title ... bold`, `auth users: User` (declares the api too), `auth users with password`, a page with the same name as a model, an app with no `page` (its root component is shown), and `else` in an `art patch` path without its `if`.
- Also accepted (from the Haiku run of that measurement): an action that names a function without calling it (`-> save`), `state x: File?` and `state xs: T[]` without a value, inline object types, `data x = [literal]` (a `state`), `view { }` around the view, `"Hi, ${name}"` in a plain string (a template), `["a" "b"]`, a block `computed` whose last expression is its value, `server fn` inside a page, a `component` named as a layout, `onAdd=(a, b) => ...` without parentheses, children in a `button`, and a list field left out of `create` (it starts empty).
- `while cond { }` and `try { } catch (e) { } finally { }`. A toast (`notify`) goes away when the user types or clicks again, not only after 4 seconds. The spec says how to tell validation errors apart (`e.details.field`, `e.status`).
- And from its second run: `auth User` (the model), `api`/`model`/`auth` written inside a page, members written among the elements, `Card()` and `Card(title="x", big)`, a flag on a component (`Badge big`), `=> save()` (an arrow without parameters), assigning a `ref`, `title ... danger`.
- A call written where an element goes (`navigate("/")` in the view) is its own error, with where it belongs. A write that fails outside a `try` shows a toast instead of failing silently.
- Fixed: an optional state narrowed by `if x == null { return }` didn't accept `x = null` afterwards.
- `use "x" { a as b }` renames an import. `URL`, `history`, `Blob`, `FormData` and other browser globals are known to the checker.
- `new` expressions (`new Chart(box, opts)`); `process` and `Buffer` in server functions; setting properties of a `ref` (`box.innerHTML = html`).
- A button with `->` inside a `form` only runs its action (it no longer submits the form too).

### Backend
- Field rules (`min`, `max`, `match`, `unique`), defaults, automatic migrations (`was=`), relations with `cascade`.
- `File` fields with uploads (local or S3/R2/MinIO), live data (`data ... live`), `server job ... every`, `email()`.
- Accounts: password reset, email verification, sessions that expire, `logoutAll()`, sign-in with Google and GitHub.
- Security defaults (CSRF, rate limits, CSP and headers, body limits) and `/api/_health`, `/api/_metrics`.

### Tools
- `art patch` accepts the variants models write and keeps comments; `art fmt` keeps comments.
- Every syntax error of a file in one compile; source maps; `art lsp` (errors, format, completion, definition, hover, rename) and a VS Code extension.
- `art mcp` (MCP server), `art add` (official components as source), `art init --template`, `art build --prerender --site`, self-contained `dist/server.js` with a Dockerfile.
- `docs/SPEC-EDIT.md`, a ~800-token spec for changing code.
- Server rendering per request: `dist/server.js` renders every page with its `data` loaded, as the visitor, embeds those responses so the browser doesn't fetch them again, and answers `requires login` with a redirect. `ART_SSR=off` turns it off.
- `art build` splits dynamic `import()` into chunks loaded on demand.
- An ArtScript implementation for js-framework-benchmark (`benchmarks/js-framework-benchmark`), passing its `isKeyed` check.
- Dev tools in `art dev` (Alt+A): every mounted component with its props, states, computed and data, live; states can be edited, updates flash on the page, and `__art.snapshot()` gives the same to the console or an agent. Not in production builds.
- A tree-sitter grammar (`editors/tree-sitter-artscript`) for highlighting in Zed, Neovim and Helix; CI checks that every `.art` file in the repository parses with it.
- Cost eval: 11 more tasks (50 in total) with reference apps in the five stacks: pagination, a sortable table, a stopwatch, a layout with routes, the query string, a multi-step form, inline editing, and full-stack edits, server-side logic, server-side search with pages, and accounts with private data. `node benchmarks/eval/check-refs.ts <task>` checks a task's references alone. `--checkpoint <name>` saves every finished run as it ends and continues from there.
- `art init` adds a Cursor rule (`.cursor/rules/artscript.mdc`).
- `art build --base /sub` for apps served under a subpath; same-page `#section` links scroll, and links to files that aren't routes load them.
- Several files may `use` the same names; the compiler also bundles for the browser without shims.
- The website is an ArtScript app (`website/`), with `llms.txt`, `llms-full.txt` and every guide as Markdown.

### Changes to existing code
- Indexing a list (`xs[i]`) is `T` instead of `T?`, as in TypeScript; `find()` and `get()` are still `T?`.
- `index.html` loads `/app.js` as a module that starts the app itself (no inline script).

## 0.1 (2026-09-30)

First version: `model`, `component`, `page`, `state`, `computed`, `fn`, the view, `api`/`data`, `auth`, roles, `server fn`, `art check --ai`, `art context`, `art patch`, `art fmt`, `art dev`, `art build`, and the cost eval.
