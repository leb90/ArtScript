# Working with AI agents

ArtScript is built to be written by models. This guide is about getting the most out of that: what to give the agent, which tools to connect, and the habits that keep each change cheap.

## What the agent should read

| Task | Give it | Size |
|---|---|---|
| Build an app or a new feature | The [spec](docs/SPEC.md) (`ARTSCRIPT.md` in every project) | ~3K tokens |
| Change existing code | The [edit spec](docs/SPEC-EDIT.md) (`ARTSCRIPT-EDIT.md`) | ~800 tokens |
| Understand a project | `art context` (the project map) | grows with the project |
| Change one component | `art context Name` (its source and every patch path) | a few hundred tokens |

The spec is the same in every request, so with prompt caching it is billed at the cache rate after the first one. The measured runs counted it in full anyway.

Agents that crawl the web can start from [llms.txt](/llms.txt) or read everything at once in [llms-full.txt](/llms-full.txt). Every page of this site has a Markdown version and a "Copy page for your AI" button.

## Instructions file

`art init` writes `AGENTS.md` and `CLAUDE.md` into each project. Agents that read instruction files (Claude Code, Cursor, Codex, Windsurf...) pick it up by themselves. It tells them to:

- read `ARTSCRIPT.md` before writing code, or `ARTSCRIPT-EDIT.md` to only change it;
- check every change with `npx art check --ai`;
- read `npx art context` instead of whole files;
- prefer a small `art patch` to rewriting files;
- write `test` blocks and run `npx art test`.

If your agent uses another file (`.cursorrules`, `.github/copilot-instructions.md`), copy the same text there.

## MCP

`art mcp` is an MCP server (stdio) with four tools:

- `art_spec`: the spec, full or the short edit version.
- `art_check`: typecheck; errors as JSON with `expected`, `actual` and `fixes`.
- `art_context`: the project map, or the source and patch paths of the named parts.
- `art_patch`: apply a patch; atomic and typechecked, nothing is written if it fails.

Claude Code:

```sh
claude mcp add artscript -- npx art mcp
```

Cursor (`.cursor/mcp.json`), Windsurf and other clients:

```json
{
  "mcpServers": {
    "artscript": { "command": "npx", "args": ["art", "mcp"] }
  }
}
```

Use `--dir path` when the project isn't the working directory.

## Errors that carry their fix

```sh
$ npx art check --ai
{"code":"E1011","type":"UNKNOWN_FIELD","loc":"src/app.art:13:10","at":"Users","expr":"u.emial","expected":"id|name|email","fixes":["email"]}
```

Each error is one JSON line: a stable `code` and `type`, where it is, the expression, what was expected, what was found and the suggested fixes. The model doesn't need to guess, and the retry is usually a one-line patch. The catalog is in [Errors](/reference/errors).

The compiler is also tolerant of what models write out of habit when it's unambiguous (TypeScript-style function types, props without commas, a one-line `if`), and canonical formatting (`art fmt`) cleans it up afterwards.

## Patches instead of rewrites

To change existing code, the agent sends only the change:

```patch
replace Todos/column/title
  title "My tasks"
insert after Todos/column/row
  text "Type and press Enter" muted
set Todos/column gap=6
```

Paths come from `art context`: `Component/tag/tag[n]` for the view, `Component.member` for members, `Model.field` for fields. The whole patch is checked and applied atomically, so a broken edit never lands half-way. The format is in the [edit spec](docs/SPEC-EDIT.md).

## A workflow that stays cheap

1. **Start from the spec**, and a template if one is close (`art init app --template users`).
2. **One feature per request.** Small requests mean small answers and small retries.
3. **Check after every change** (`art check --ai`) and feed the errors back as they are.
4. **Write tests for the flows that matter**, and run them after each change.
5. **For later changes**, give the edit spec and `art context` of the parts involved, and ask for a patch.

## Prompts that work

For a new app:

```text
Build a [description] in ArtScript. The spec is in ARTSCRIPT.md.
Put it in src/app.art. Run `npx art check --ai` and fix every error.
Add test blocks for the main flows and make `npx art test` pass.
```

For a change:

```text
In the ArtScript app, [change]. Read ARTSCRIPT-EDIT.md and
`npx art context [Component]`, answer with an art patch, apply it
with `npx art patch`, then run `npx art check --ai` and `npx art test`.
```

## What it costs

The [benchmarks](/benchmarks) compare ArtScript with React, Svelte, Vue and SolidJS on the same tasks, with Claude Opus, Sonnet and Haiku, counting the spec, retries and thinking tokens. With Sonnet, ArtScript cost 57% less per working app than React with TypeScript.
