---
name: artscript
description: Builds and changes web apps in ArtScript, a full-stack language made for AI agents (.art files hold the pages, components, data models and api of one program, and every error comes with its fix). Use it when a project has .art files or depends on @artscript/core, or when asked to create a web app, site or landing page with ArtScript.
---

ArtScript compiles `.art` files into a small JavaScript app and, when it has an api, its server. Expressions are JavaScript; only the structure (`page`, `component`, `model`, `api`, `state`, `computed`, `data`, `fn`, the view) is ArtScript's own. Docs: https://artscript.dev · Source (MIT): https://github.com/leb90/ArtScript

## Start

- A new app: `npm create artscript@latest my-app`, then `cd my-app && npm install && npm run dev`. The project brings its own copy of these instructions and of the specs (`AGENTS.md`, `ARTSCRIPT.md`, `.claude/skills/artscript`), matched to the version it installs: from then on, follow those.
- A project with `.art` files but no `ARTSCRIPT.md`: `npx art upgrade` adds them.

## The language

Before writing code, read the project's `ARTSCRIPT.md` or, without a project, `references/SPEC.md` (the whole language, ~3.4K tokens). `references/SPEC-CORE.md` (~1.9K tokens, a whole app as the example) is enough for a small app or a canvas one; to only change existing code, `references/SPEC-EDIT.md` (~800 tokens) is enough.

## The loop

- After every change run `npx art check --ai` and apply what it reports: each error has `expected`, `actual` and `fixes`.
- Read `npx art context <Component>` instead of whole files; prefer a small `npx art patch` to rewriting files.
- Split the code into files from the start: every `.art` file in `src/` (subfolders too) is part of one program, with no imports. `app.art` keeps the pages, each putting its sections together; one component per file in `src/components/`; the data and constants people change (prices, texts, an email address) in `src/config.art`; the tests in `src/tests.art`. A one-screen app can stay in `app.art`.
- Write `test "..." { }` blocks for the main flows and run `npx art test`.
- Format with `npx art fmt --write`; run with `npm run dev`; ship with `npx art build`.
- If MCP is available, `npx art mcp` offers `art_spec`, `art_check`, `art_context` and `art_patch` as tools.
- Write everything in `.art`: data, constants, helpers and formatting (`Intl`, `Date` and string methods cover most of it); when you do need an npm package, call it from `.art` too (`use "pkg" { x }`). Imperative code goes in a `.ts` file instead: code that drives the DOM or a canvas, or runs heavy loops (an animation or physics loop, canvas or WebGL drawing, a parser), and the wrapper of a library that owns its DOM (a map, a chart). Not in `.ts`: mock data, constants, date or money formatters, small wrappers around npm functions. What you import from `.ts` arrives as `Any`: the checker can't verify it, and `art check` warns (`MODULE_COULD_BE_ART`) when a module could be ArtScript.
