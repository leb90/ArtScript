# Changelog

ArtScript follows [semantic versioning](https://semver.org) from 1.0. Before 1.0, a minor version (0.x) may change the syntax; every change of that kind is listed here with what to write instead.

## Unreleased (next: 0.2.1)

From building three apps with the published package (a shop, a backoffice, a landing page):

- `aria-*` and `data-*` on any element (`button "Menu" aria-expanded=open`), and `tag=` on texts and containers for the HTML element (`title "Plans" tag=h1`, `column tag=nav`). `form ... novalidate`.
- The runtime's base styles and the rules of responsive props are in a cascade layer (`@layer art`): any rule of your own CSS wins, whatever its specificity (before, `.footer-grid { grid-template-columns: ... }` lost to `md:cols=4`, and `:root { --a-bg: ... }` to the dark theme).
- Fixed: `style="..."` together with `gap`/`pad` crashed (and replaced the element's styles; it now adds to them); prerender wrote a string `style` as garbage; browser-only code in `mount` (an observer, `matchMedia`) aborted `art build --prerender`; a `class` on `icon` dropped its own class; links to a section of the current page (`/#plans`) were marked `aria-current`.
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
