# Instructions for AI agents

This project uses **ArtScript** (`.art` files in `src/`). Read `ARTSCRIPT.md` (the whole language, ~3.4K tokens) before writing code; `ARTSCRIPT-CORE.md` (~1.9K tokens, a whole app as the example) is enough for a small app or a canvas one. To only change existing code, `ARTSCRIPT-EDIT.md` (~800 tokens) is enough.

If your tool supports MCP, `npx art mcp` gives you `art_spec`, `art_check`, `art_context` and `art_patch` as tools.

- Check every change with `npx art check --ai`: it returns errors as JSON with suggested `fixes`.
- To understand a part without reading everything: `npx art context` (project map) or `npx art context <Component>`.
- To change existing code, prefer a small `art patch` (see the spec) over rewriting files: `npx art patch <file.patch>`.
- Canonical format: `npx art fmt --write`.
- Ready-made components (as source): `npx art add DataTable Pagination ConfirmButton SearchBox Stat EmptyState`.
- Behavior: write `test "..." { ... }` blocks (see the spec) and run `npx art test`.
- Expressions are JavaScript; only the structure (`page`, `component`, `model`, `api`, `state`, `computed`, `data`, `fn`, the view) is ArtScript's own.
- Heavy imperative code (a physics loop, a parser, canvas drawing) goes in a `.ts` file next to the `.art` files, imported with `use "./sim.ts" { step, draw }`: plain TypeScript, no restrictions. ArtScript is for the page, the state, the api, forms, lists and tests. Measured: with this rule an agent writes the ArtScript page as fluently as a React one.
