# CLI

Every command is `art <command>`. In a project created with `art init`, run them with `npx art` or through the npm scripts (`npm run dev`, `npm run build`, `npm run check`). A `[path]` defaults to `./src` if it exists, otherwise the current directory.

## Projects

### `art init <name> [--template t]`

Creates a project: `src/app.art`, `public/`, the spec for your agent (`ARTSCRIPT.md`, `ARTSCRIPT-EDIT.md`), `AGENTS.md`, `CLAUDE.md` and a Cursor rule (`.cursor/rules/artscript.mdc`). Templates: `todo`, `blog`, `users`, `notes`, `catalog`, `crm`.

### `art dev [path] [--port 3000]`

The development server: compiles on every save and reloads the page, serves the api with a local database in `.art/data/`, and prints emails instead of sending them.

Dev tools: press Alt+A in the page (or click the "art" badge at the bottom right) for a panel with every mounted component and its props, states, computed and data, live. Click a state's value to change it; what each update writes to the page flashes. From the console, or for an agent driving the browser, `__art.snapshot()` returns the same as plain objects. None of this is in the production build.

### `art build [path] [--out dist] [--sourcemap] [--base /sub] [--prerender [--site url]]`

The production build: `index.html`, one minified `app.js` (the runtime and every `use` module bundled in) and a minified `app.css`. Without apis, `dist/` is plain static files: any static server shows it as visitors get it (`npx serve dist`), also for a screenshot tool or an agent driving a browser. A dynamic `import()` inside a `use` module becomes its own file in `chunks/`, downloaded only when it runs. With apis, also `server.js` (a single file with the server and its packages, no `node_modules`) and a `Dockerfile`.

- `--prerender`: an HTML file per page without params, with its content and meta tags.
- `--site https://example.com`: with `--prerender`, also `sitemap.xml` and `robots.txt`, and each page's canonical address, `og:url` and `twitter:card`. A path in it (`https://me.github.io/repo/`) is also the `--base`.
- `--base /sub`: the app is served under that path.
- `--sourcemap`: `app.js.map`, pointing back to the `.art` files.
- `--demo`: a full-stack app as static files. The api, accounts and server fns run in the visitor's browser with the server's rules, and their data stays in that browser: a demo that costs nothing to host (any static host, no server). See [Deploying](/learn/deploy).

## Code

### `art check [path] [--ai]`

Typechecks the project. Each error has a code, a location, what was expected and found, and the suggested fixes. `--ai` prints one JSON line per error.

### `art fmt [path] [--write]`

The canonical format. Without `--write` it prints the result; with it, it rewrites the files.

### `art patch [file|-] [--dir path] [--dry-run] [--ai]`

Applies a patch (from a file, or stdin without one): `replace`, `insert before|after`, `append`, `remove`, `set` and `add` operations on paths of the code. Atomic and typechecked: if anything fails, nothing is written. `--dry-run` checks without writing.

### `art context [Name...] [--dir path] [--budget N]`

Compact context for a model. Without names, the project map (models, apis, components and pages with their props). With names, their source and every addressable patch path. `--budget` caps the size in tokens.

### `art add <Component...>`

Copies official components into the project as source: `DataTable`, `Pagination`, `ConfirmButton`, `SearchBox`, `Stat`, `EmptyState`.

### `art test [path] [--api url [--reset /path]]`

Runs every `test "..." { }` block in a simulated browser, with the real api and a fresh database for each test.

- `--api http://localhost:8787`: for an app with a server of its own. The page's `/api/...` requests go to that server (from the page's origin, so sessions work), and the tests see its answers and messages.
- `--reset /api/_test/reset`: a path of that server that gets a `POST` before each test, so each one starts from clean data.

### `art upgrade [path]`

After updating `@artscript/core`, refreshes the agent instructions `art init` copied into the project, so the agent reads this version's rules: `ARTSCRIPT.md`, `ARTSCRIPT-CORE.md`, `ARTSCRIPT-EDIT.md`, the Claude Code skill, the Cursor rule and the ArtScript block of `AGENTS.md` (between its `artscript:start` and `artscript:end` markers; what the project wrote outside them stays). Missing ones are added. An `AGENTS.md` from before the markers that the project had edited is kept as `AGENTS.md.old`. `art check` warns (`INSTRUCTIONS_OUTDATED`) while any copy is older than the installed package.

## Tools

### `art mcp [--dir path]`

An MCP server over stdio with `art_spec`, `art_check`, `art_context` and `art_patch`. See [Working with AI agents](/ai/agents).

### `art lsp`

A language server over stdio: live errors with the compiler's fixes, formatting and completion, for any editor with LSP. The VS Code extension in `editors/vscode` uses it. For highlighting in Zed, Neovim and Helix there is a tree-sitter grammar in `editors/tree-sitter-artscript`.

### `art ast <file>`

The syntax tree of a file as JSON.

### `art bench`

Token and byte measurements against React and Svelte (inside the ArtScript repository).
