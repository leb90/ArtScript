# Introduction

ArtScript is a web language and framework for building full-stack apps with AI. You describe the data, the pages and the behavior in `.art` files; the compiler turns them into a small JavaScript app and a Node server with a database.

It exists for one reason: **an AI model should be able to build and change a web app for fewer dollars than with React, Svelte or Vue**, counting everything it costs (the docs it reads, the code it writes, the mistakes it makes and the retries that follow).

```art
page Counter "/" {
  state count = 0
  computed double = count * 2

  row gap=2 {
    button "-" -> count--
    text count bold
    button "+" primary -> count++
  }
  text `Double is ${double}` muted
}
```

That is a complete app: no imports, no hooks, no build configuration.

## Who it is for

- **People who build with an AI agent** (Claude Code, Cursor, Windsurf or your own) and pay for its tokens.
- **Agents themselves**: the whole language fits in a ~3K-token spec, every error comes with its fix, and changes are small patches instead of rewritten files.
- **Small teams** that want a full-stack app (accounts, a database, an api, uploads, live data) without assembling a stack.

## What makes it cheaper for a model

**Less code for the same app.** One line per element, a backend that is one line per resource, and no boilerplate. The same app takes about a third of the tokens it takes in React with TypeScript, and output tokens are the most expensive ones.

**A language that fits in the prompt.** The [spec](docs/SPEC.md) describes all of it in about 3K tokens, and an agent that only changes existing code needs the [edit spec](docs/SPEC-EDIT.md) (about 800). With prompt caching it is paid once per session.

**Mistakes caught before they run.** The compiler checks types, null safety, the api calls against the models, element names and props. Each error has a stable code, what was expected and the fix, as JSON with `art check --ai`. A wrong field name costs one cheap retry instead of a broken page.

**Edits instead of rewrites.** `art context` gives the agent only the part of the project it needs, and `art patch` applies a small, typechecked change to it.

The [benchmarks](#cost-eval-results) measure this with Claude Opus, Sonnet and Haiku against React, Svelte, Vue and SolidJS.

## What you get

- **UI**: forms, lists, tables, tabs, modals, media, icons, layouts with responsive props, dark mode, scoped styles.
- **Reactivity**: `state`, `computed` and `effect` on signals, with direct DOM updates (no virtual DOM). Apps ship about 5 KB of JavaScript, runtime included.
- **Pages**: routes with params, layouts, client-side navigation, meta tags, guards and prerendered HTML.
- **Backend**: models, REST apis with validation, SQLite storage, queries, relations, file uploads, live updates, server functions and scheduled jobs.
- **Accounts**: sign-up and login with sessions, roles, per-user data, Google and GitHub sign-in, password reset and email verification.
- **Tools**: a dev server with live reload, tests in a simulated browser, a formatter, a language server, an MCP server and a production build that is one Node file plus a Dockerfile.
- **The JavaScript ecosystem**: `use` imports any npm package or your own TypeScript.

## How it relates to the frameworks you know

ArtScript is closest to Svelte and SolidJS: a compiler and fine-grained signals, no virtual DOM. It differs in scope and audience: it also covers the backend (models, apis, auth, storage), and its syntax is designed to be written by models with the fewest tokens and the fewest ways to go wrong. Expressions are plain JavaScript, so there is little new to learn inside a line.

## Status

ArtScript is at **version 0.1**. The language and tools are tested (unit, end-to-end and the cost eval run on every change) but the project is young: expect changes before 1.0, and read the [security](SECURITY.md) notes before putting real data in it.

Next: the [quick start](/learn/quick-start).
