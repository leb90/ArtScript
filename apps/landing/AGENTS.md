# Instructions for AI agents

<!-- artscript:start: kept up to date by `npx art upgrade`; write your own instructions after the end marker -->
This project uses **ArtScript** (`.art` files in `src/`). Read `ARTSCRIPT.md` (the whole language, ~3.4K tokens) before writing code; `ARTSCRIPT-CORE.md` (~1.9K tokens, a whole app as the example) is enough for a small app or a canvas one. To only change existing code, `ARTSCRIPT-EDIT.md` (~800 tokens) is enough.

If your tool supports MCP, `npx art mcp` gives you `art_spec`, `art_check`, `art_context` and `art_patch` as tools.

- Check every change with `npx art check --ai`: it returns errors as JSON with suggested `fixes`.
- To understand a part without reading everything: `npx art context` (project map) or `npx art context <Component>`.
- To change existing code, prefer a small `art patch` (see the spec) over rewriting files: `npx art patch <file.patch>`.
- Canonical format: `npx art fmt --write`.
- Ready-made components (as source): `npx art add DataTable Pagination ConfirmButton SearchBox Stat EmptyState`.
- Behavior: write `test "..." { ... }` blocks (see the spec) and run `npx art test`.
- Expressions are JavaScript; only the structure (`page`, `component`, `model`, `api`, `state`, `computed`, `data`, `fn`, the view) is ArtScript's own.
- Write everything in `.art`: data, constants, helpers and formatting (`Intl`, `Date` and string methods cover most of it); when you do need an npm package, call it from `.art` too (`use "pkg" { x }`). Imperative code goes in a `.ts` file instead: code that drives the DOM or a canvas, or runs heavy loops (an animation or physics loop, canvas or WebGL drawing, a parser), and the wrapper of a library that owns its DOM (a map, a chart). Not in `.ts`: mock data, constants, date or money formatters, small wrappers around npm functions. What you import from `.ts` arrives as `Any`: the checker can't verify it, and `art check` warns (`MODULE_COULD_BE_ART`) when a module could be ArtScript.
<!-- artscript:end -->
