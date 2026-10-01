# Contributing

Thanks for helping. ArtScript's goal is measurable: AI models should build and change web apps for fewer dollars than with React, Svelte, Vue or SolidJS, with the same results. Every change is judged by that.

## Setup

Node 24 runs the TypeScript sources directly.

```
npm install
npm test            # the whole suite (no network, no API key)
npm run typecheck
npm run eval -- --dry-run   # the cost eval's harness and every reference app, offline
```

## Rules of the code

- `src/` is TypeScript with erasable syntax only (no `enum`, `namespace` or parameter properties); imports end in `.ts`.
- `runtime/` is plain JavaScript that ships to browsers and servers: no dependencies, keep it small.
- UI elements are defined once, in `src/elements.ts`.
- New errors go in the catalog (`src/errors.ts`) with `expected`, `actual` and `fixes` when possible: models fix their code from them.
- A syntax change updates `docs/SPEC.md` (and `docs/SPEC-EDIT.md` if it matters for edits), the printer and the tests. The spec is paid for in every request: keep additions short.
- Commits, comments and docs are in English.

## Proposing language changes

Open an issue describing what models write today, what they'd write with the change, and how you'll measure it (an eval task, or `--replay` on stored answers). Changes that make the spec longer need to pay for themselves in fewer tokens or retries.

## Versions

Until 1.0, minor versions may change the syntax; `CHANGELOG.md` lists every such change with what to write instead. From 1.0, semantic versioning: breaking syntax changes only in major versions.
