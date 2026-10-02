# Changelog

ArtScript follows [semantic versioning](https://semver.org) from 1.0. Before 1.0, a minor version (0.x) may change the syntax; every change of that kind is listed here with what to write instead.

## Unreleased (next: 0.2)

### Language
- `use` for npm packages and your own JS/TS modules, checked at compile time.
- Real routes: `page X "/products/:id"` with typed `params`, `query`, `"*"`, layouts with `slot`, `navigate()`.
- UI elements: `select`, `radio`, `tabs`, `checkbox`, `textarea`, `file`, `modal`, `table`, `list`, `badge`, `spinner`, `divider`, `video`, `audio`, `icon` (Lucide), `meta`; `label=` on inputs; `notify()` toasts.
- `on:<event>`, `ref`, `mount`, `effect`, `cleanup`; component children with `slot` and named slots; typed callbacks `Fn(User)`.
- Keyed lists (`for p in xs key p.id`) that keep their DOM; responsive props (`md:cols=3`).
- Assignable `computed`, two-way props, mutations through parameters update the screen, TS-style annotations and defaults accepted in params.
- `test "..." { ... }` blocks run by `art test`; steps find inputs by placeholder or label.
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
- `art build --base /sub` for apps served under a subpath; same-page `#section` links scroll, and links to files that aren't routes load them.
- Several files may `use` the same names; the compiler also bundles for the browser without shims.
- The website is an ArtScript app (`website/`), with `llms.txt`, `llms-full.txt` and every guide as Markdown.

### Changes to existing code
- Indexing a list (`xs[i]`) is `T` instead of `T?`, as in TypeScript; `find()` and `get()` are still `T?`.
- `index.html` loads `/app.js` as a module that starts the app itself (no inline script).

## 0.1 (2026-09-30)

First version: `model`, `component`, `page`, `state`, `computed`, `fn`, the view, `api`/`data`, `auth`, roles, `server fn`, `art check --ai`, `art context`, `art patch`, `art fmt`, `art dev`, `art build`, and the cost eval.
