---
name: artscript
description: How to write, check and change ArtScript (.art) code in this project. Use it before touching any .art file.
---

This project is written in ArtScript (`.art` files in `src/`). Before writing `.art` code, read `ARTSCRIPT.md` (the whole language, ~3K tokens); to only change existing code, `ARTSCRIPT-EDIT.md` (~800 tokens) is enough.

- Expressions are JavaScript; only the structure (`page`, `component`, `model`, `api`, `state`, `computed`, `data`, `fn`, the view) is ArtScript's own.
- After every change run `npx art check --ai` and apply what it reports: each error has `expected`, `actual` and `fixes`.
- Read `npx art context <Component>` instead of whole files; prefer a small `npx art patch` to rewriting files.
- Write `test "..." { }` blocks for the main flows and run `npx art test`.
- Format with `npx art fmt --write`; run with `npm run dev`; ship with `npx art build`.
- If MCP is available, `npx art mcp` offers `art_spec`, `art_check`, `art_context` and `art_patch` as tools.
- Heavy imperative code (a physics loop, a parser, canvas drawing) goes in a `.ts` or `.js` file next to the `.art` files, imported with `use "./engine.ts" { step, draw }`: plain JavaScript or TypeScript with no restrictions. Keep ArtScript for what it shortens: pages, state, the api, forms, lists and tests.
