# Instructions for AI agents

This project uses **ArtScript** (`.art` files in `src/`). The full language spec is in `ARTSCRIPT.md`: read it before writing code. To only change existing code, `ARTSCRIPT-EDIT.md` (~800 tokens) is enough.

If your tool supports MCP, `npx art mcp` gives you `art_spec`, `art_check`, `art_context` and `art_patch` as tools.

- Check every change with `npx art check --ai`: it returns errors as JSON with suggested `fixes`.
- To understand a part without reading everything: `npx art context` (project map) or `npx art context <Component>`.
- To change existing code, prefer a small `art patch` (see the spec) over rewriting files: `npx art patch <file.patch>`.
- Canonical format: `npx art fmt --write`.
- Expressions are JavaScript; only the structure (`page`, `component`, `model`, `api`, `state`, `computed`, `data`, `fn`, the view) is ArtScript's own.
