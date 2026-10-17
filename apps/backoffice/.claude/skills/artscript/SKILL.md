---
name: artscript
description: How to write, check and change ArtScript (.art) code in this project. Use it before touching any .art file.
---

This project is written in ArtScript (`.art` files in `src/`). Read `ARTSCRIPT.md` (the whole language, ~3.4K tokens) before writing code; `ARTSCRIPT-CORE.md` (~1.9K tokens, a whole app as the example) is enough for a small app or a canvas one. To only change existing code, `ARTSCRIPT-EDIT.md` (~800 tokens) is enough.

- Expressions are JavaScript; only the structure (`page`, `component`, `model`, `api`, `state`, `computed`, `data`, `fn`, the view) is ArtScript's own.
- After every change run `npx art check --ai` and apply what it reports: each error has `expected`, `actual` and `fixes`.
- Read `npx art context <Component>` instead of whole files; prefer a small `npx art patch` to rewriting files.
- Write `test "..." { }` blocks for the main flows and run `npx art test`.
- Format with `npx art fmt --write`; run with `npm run dev`; ship with `npx art build`.
- If MCP is available, `npx art mcp` offers `art_spec`, `art_check`, `art_context` and `art_patch` as tools.
- Write everything in `.art`: data, constants, helpers and formatting (`Intl`, `Date` and string methods cover most of it); when you do need an npm package, call it from `.art` too (`use "pkg" { x }`). Imperative code goes in a `.ts` file instead: code that drives the DOM or a canvas, or runs heavy loops (an animation or physics loop, canvas or WebGL drawing, a parser), and the wrapper of a library that owns its DOM (a map, a chart). Not in `.ts`: mock data, constants, date or money formatters, small wrappers around npm functions. What you import from `.ts` arrives as `Any`: the checker can't verify it, and `art check` warns (`MODULE_COULD_BE_ART`) when a module could be ArtScript.
