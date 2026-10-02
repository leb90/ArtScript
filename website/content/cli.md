# CLI

Every command is `art <command>`. In a project created with `art init`, run them with `npx art` or through the npm scripts (`npm run dev`, `npm run build`, `npm run check`). A `[path]` defaults to `./src` if it exists, otherwise the current directory.

## Projects

### `art init <name> [--template t]`

Creates a project: `src/app.art`, `public/`, the spec for your agent (`ARTSCRIPT.md`, `ARTSCRIPT-EDIT.md`), `AGENTS.md`, `CLAUDE.md` and a Cursor rule (`.cursor/rules/artscript.mdc`). Templates: `todo`, `blog`, `users`, `notes`, `catalog`, `crm`.

### `art dev [path] [--port 3000]`

The development server: compiles on every save and reloads the page, serves the api with a local database in `.art/data/`, and prints emails instead of sending them.

Dev tools: press Alt+A in the page (or click the "art" badge at the bottom right) for a panel with every mounted component and its props, states, computed and data, live. Click a state's value to change it; what each update writes to the page flashes. From the console, or for an agent driving the browser, `__art.snapshot()` returns the same as plain objects. None of this is in the production build.

### `art build [path] [--out dist] [--sourcemap] [--base /sub] [--prerender [--site url]]`

The production build: `index.html`, one minified `app.js` (the runtime and every `use` module bundled in) and `app.css`. A dynamic `import()` inside a `use` module becomes its own file in `chunks/`, downloaded only when it runs. With apis, also `server.js` (a single file with the server and its packages, no `node_modules`) and a `Dockerfile`.

- `--prerender`: an HTML file per page without params, with its content and meta tags.
- `--site https://example.com`: with `--prerender`, also `sitemap.xml` and `robots.txt`.
- `--base /sub`: the app is served under that path.
- `--sourcemap`: `app.js.map`, pointing back to the `.art` files.

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

### `art test [path]`

Runs every `test "..." { }` block in a simulated browser, with the real api and a fresh database for each test.

## Tools

### `art mcp [--dir path]`

An MCP server over stdio with `art_spec`, `art_check`, `art_context` and `art_patch`. See [Working with AI agents](/ai/agents).

### `art lsp`

A language server over stdio: live errors with the compiler's fixes, formatting and completion, for any editor with LSP. The VS Code extension in `editors/vscode` uses it. For highlighting in Zed, Neovim and Helix there is a tree-sitter grammar in `editors/tree-sitter-artscript`.

### `art ast <file>`

The syntax tree of a file as JSON.

### `art bench`

Token and byte measurements against React and Svelte (inside the ArtScript repository).
