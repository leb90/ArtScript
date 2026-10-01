# ArtScript

An AI-native web language that compiles to JavaScript. Goal: let an AI build and modify web apps for **less money** (fewer tokens, less context, fewer retries) than with React/TypeScript.

```
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

Status: **v0.1, MVP foundation**.

**Early result:** Claude built the same 10 apps (8 frontend, 2 full-stack) in ArtScript, React + TypeScript and Svelte; each app was run and used in a simulated browser to check it works. With Claude Sonnet 5.5 every app worked in all three stacks, and ArtScript cost **57% less per working app than React + TypeScript and 50% less than Svelte** (67% less than React on the full-stack tasks), counting the spec, retries and thinking tokens. Modifying larger existing projects (an 11-component shop and a 42-component admin panel, 64 changes per stack), it cost **49% less than React** (43–57% depending on the project and on whether the whole project or only the relevant parts were in the prompt). Against Vue 3 and SolidJS (also Sonnet 5.5) it cost about 52% less per working app. With the smaller Claude Haiku 4.5 (a partial run, 12 tasks) it cost 29% less than React. The apps it produces ship about 2–3 KB of JavaScript (brotli) versus ~59 KB for React, ~20 KB for Svelte, ~24 KB for Vue and ~6 KB for Solid. An earlier, compile-only run with Claude Opus 5.5 gave 44% less. See [Cost eval results](#cost-eval-results).

## Usage

Requires Node 24+.

```sh
npm install
npm run dev            # todo example at http://localhost:3000 (reloads on save)
npm run dev:counter    # counter example
npm run art -- dev examples/users   # full-stack CRUD example (api + data)
npm run art -- dev examples/notes   # accounts, private data and a server fn
npm run art -- dev examples/catalog # admin role, search, sort and pagination
npm test               # tests
npm run typecheck      # compiler types
npm run bench          # tokens and bytes vs React/Svelte
```

Create a new project (it comes with `npm run dev`, `npm run build` and `npm run check`):

```sh
node src/cli.ts init my-app
cd my-app && npm install && npm run dev
```

A full-stack CRUD needs one line of backend. `api users: User` serves `/api/users` (list, get, create, update, remove), validated against the model and stored as JSON; `data` loads it and reloads by itself after every write:

```
model User {
  id: ID
  name: String
  email: Email
}

api users: User

page Users {
  data users = api.users.list()
  state name = ""

  input name
  button "Add" -> api.users.create({ name, email: "a@b.co" })
  for u in users {
    text u.name
    button "x" -> api.users.remove(u.id)
  }
}
```

The client is typed end to end: `create` is checked against the model at compile time. `art dev` serves the api; `art build` also emits `dist/server.js` (`node dist/server.js`, no dependencies).

Accounts, per-user data and server logic are one line each:

```
api notes: Note private     // each user only sees and edits their own notes (owner is filled in)
auth users                  // auth.signup / login / logout / me: scrypt-hashed passwords, cookie sessions

server fn stats() {         // runs on the server, called as server.stats()
  if !me {
    fail("Log in first", 401)
  }
  let mine = db.notes.list().filter(n => n.owner == me.id)
  return { total: mine.length }
}
```

Passwords are never returned, and the accounts api only lets each user change or delete their own account. `api products: Product admin` lets anyone read and only admins write; the first account becomes the admin and nobody can give themselves a role.

Data lives in SQLite (built into Node, no dependencies), with typed queries:

```
data products = api.products.list({ search, sort: "-price", limit: 20, offset: page * 20 })
data total = api.products.count({ search })
```

Pages have real routes, layouts and client-side navigation (History API):

```
layout Main {
  link "Home" to="/"
  slot
}

page Product "/products/:id" {
  data product = api.products.get(params.id)   // params.id is typed from the route
}

page NotFound "*" {
  title "Not found"
}
```

Any npm package or JS/TS module of your own can be used with `use`; the compiler checks that the module and every imported name exist, and `art build` bundles everything into one minified file:

```
use "date-fns" { format }
use "./lib/money.ts" { toUSD }
```

To change existing code, an AI can send a small `art patch` instead of rewriting files; the whole patch is typechecked and applied atomically:

```
replace Todos/column/title
  title "My tasks"
insert after Todos/column/row
  text "Type and press Enter" muted
set Todos/column gap=6
```

`art context <Component>` lists every addressable path.

Other commands: `npm run art -- <command>` (for example `npm run art -- check examples/todo --ai`). Full list: `npm run art -- help`.

Not published on npm yet (see [docs/PUBLISHING.md](docs/PUBLISHING.md)).

## Layout

```
src/
  lexer.ts      source → tokens
  parser.ts     tokens → AST (Pratt parser for JS expressions)
  ast.ts        AST types (stable, JSON-serializable)
  checker.ts    types, null safety, errors with fixes
  codegen.ts    AST → ES module that builds the DOM directly (no virtual DOM)
  printer.ts    AST → canonical code (fmt, errors, context)
  context.ts    compact context for LLMs
  patch.ts      `art patch`: structured AST edits, atomic and typechecked
  elements.ts   single table of UI primitives
  errors.ts     error catalog and human / AI output formats
  compile.ts    full pipeline
  cli.ts        the `art` command
runtime/runtime.js   signals + DOM helpers + api client (~2.9 KB brotli)
runtime/server.js    api server: REST from models, validation, SQLite storage, queries, auth, roles, server fns
examples/            counter, todo, users (full-stack CRUD), notes (auth + private data), catalog (roles, queries), blog (routes, layout)
benchmarks/          equivalent tasks in ArtScript / React / Svelte + measurement
docs/SPEC.md         compact spec to give an AI (~1.1K tokens)
templates/default/   starter project created by `art init`
tests/               parser, checker, runtime, e2e (in-memory DOM), tools, docs
```

## First measurements

`npm run bench`, `o200k_base` tokenizer:

| Task | ArtScript | React+TS | Svelte 5 |
|---|---|---|---|
| counter | 92 | 181 | 154 |
| todo | 245 | 471 | 400 |

This only measures **source code size**. It doesn't yet include the spec in context, agent iterations or USD cost, so no real savings can be claimed from it (that's what the agent cost eval below is for). Also, `o200k_base` is OpenAI's tokenizer; Claude's differs.

## Agent cost eval

`benchmarks/eval/` has Claude solve the same 8 tasks (6 create, 2 modify) in ArtScript, React+TS and Svelte, and measures what matters: **USD per solved task**. It counts the spec in context, retries until the code compiles, and thinking tokens.

```sh
npm run eval -- --dry-run                         # validates the harness, spends nothing
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env        # .env is gitignored
npm run eval -- --runs 3 --max-usd 10             # full run (claude-opus-5-5)
npm run eval -- --model claude-sonnet-5-5 --tasks counter,todo
```

Validation: ArtScript with its own compiler, React with strict `tsc`, Svelte with its compiler (no type checking, which favors Svelte). It doesn't check runtime behavior yet, only that the code compiles and typechecks. Results are saved to `benchmarks/eval/results/`.

<!-- eval-results:start -->

## Cost eval results

### claude-opus-5-5 (effort medium)

With `claude-opus-5-5`, ArtScript cost **44% less** per solved task than React + TS and **42% less** than Svelte 5.

| Stack | Solved | USD per solved task | vs React | Without prompt cache | Avg attempts | Output tokens / run | Final code tokens | App JS (brotli) |
|---|---|---|---|---|---|---|---|---|
| **ArtScript** | 24/24 | **$0.0131** | −44% | $0.0208 | 1.13 | 579 | 382 | — |
| React + TS | 24/24 | $0.0235 | — | $0.0235 | 1.00 | 1102 | 1026 | — |
| Svelte 5 | 24/24 | $0.0225 | −4% | $0.0225 | 1.00 | 1049 | 914 | — |

```mermaid
xychart-beta
    title "USD per solved task (claude-opus-5-5)"
    x-axis ["ArtScript", "React + TS", "Svelte 5"]
    y-axis "USD" 0 --> 0.029
    bar [0.0131, 0.0235, 0.0225]
```

<details><summary>Per task</summary>

| Task | ArtScript | React + TS | Svelte 5 |
|---|---|---|---|
| counter | $0.0037 (3/3) | $0.0119 (3/3) | $0.0118 (3/3) |
| todo | $0.0287 (3/3) | $0.0299 (3/3) | $0.0270 (3/3) |
| login | $0.0055 (3/3) | $0.0204 (3/3) | $0.0196 (3/3) |
| search | $0.0091 (3/3) | $0.0208 (3/3) | $0.0214 (3/3) |
| cart | $0.0280 (3/3) | $0.0354 (3/3) | $0.0410 (3/3) |
| tabs | $0.0112 (3/3) | $0.0297 (3/3) | $0.0237 (3/3) |
| counter-mod | $0.0070 (3/3) | $0.0157 (3/3) | $0.0176 (3/3) |
| todo-mod | $0.0120 (3/3) | $0.0245 (3/3) | $0.0178 (3/3) |

</details>

Run 2026-09-30: 8 tasks × 3 stacks × 3 runs, total $1.42, prices as of 2026-09-25. Raw data: [`benchmarks/eval/results/2026-09-30T22-23-39-claude-opus-5-5.json`](benchmarks/eval/results/2026-09-30T22-23-39-claude-opus-5-5.json).

### claude-sonnet-5-5 (effort medium)

With `claude-sonnet-5-5`, ArtScript cost **57% less** per solved task than React + TS and **50% less** than Svelte 5.

| Stack | Solved | USD per solved task | vs React | Without prompt cache | Avg attempts | Output tokens / run | Final code tokens | App JS (brotli) |
|---|---|---|---|---|---|---|---|---|
| **ArtScript** | 20/20 | **$0.0057** | −57% | $0.0097 | 1.00 | 343 | 377 | 1.9 KB |
| React + TS | 20/20 | $0.0134 | — | $0.0134 | 1.00 | 1255 | 1210 | 58.7 KB |
| Svelte 5 | 20/20 | $0.0116 | −14% | $0.0116 | 1.00 | 1072 | 1092 | 18.2 KB |
| Vue 3 | 20/20 | $0.0120 | −10% | $0.0120 | 1.00 | 1117 | 1118 | 23.5 KB |
| SolidJS | 20/20 | $0.0119 | −11% | $0.0119 | 1.00 | 1105 | 1145 | 5.6 KB |

```mermaid
xychart-beta
    title "USD per solved task (claude-sonnet-5-5)"
    x-axis ["ArtScript", "React + TS", "Svelte 5", "Vue 3", "SolidJS"]
    y-axis "USD" 0 --> 0.017
    bar [0.0057, 0.0134, 0.0116, 0.0120, 0.0119]
```

<details><summary>Per task</summary>

| Task | ArtScript | React + TS | Svelte 5 | Vue 3 | SolidJS |
|---|---|---|---|---|---|
| counter | $0.0022 (2/2) | $0.0055 (2/2) | $0.0043 (2/2) | $0.0054 (2/2) | $0.0052 (2/2) |
| todo | $0.0054 (2/2) | $0.0132 (2/2) | $0.0113 (2/2) | $0.0124 (2/2) | $0.0128 (2/2) |
| login | $0.0102 (2/2) | $0.0098 (2/2) | $0.0098 (2/2) | $0.0086 (2/2) | $0.0095 (2/2) |
| search | $0.0041 (2/2) | $0.0095 (2/2) | $0.0087 (2/2) | $0.0102 (2/2) | $0.0091 (2/2) |
| cart | $0.0096 (2/2) | $0.0159 (2/2) | $0.0173 (2/2) | $0.0182 (2/2) | $0.0153 (2/2) |
| tabs | $0.0038 (2/2) | $0.0114 (2/2) | $0.0078 (2/2) | $0.0080 (2/2) | $0.0094 (2/2) |
| counter-mod | $0.0029 (2/2) | $0.0077 (2/2) | $0.0050 (2/2) | $0.0056 (2/2) | $0.0061 (2/2) |
| todo-mod | $0.0027 (2/2) | $0.0115 (2/2) | $0.0050 (2/2) | $0.0076 (2/2) | $0.0055 (2/2) |
| fs-users | $0.0050 (2/2) | $0.0235 (2/2) | $0.0218 (2/2) | $0.0207 (2/2) | $0.0215 (2/2) |
| fs-shopping | $0.0114 (2/2) | $0.0259 (2/2) | $0.0245 (2/2) | $0.0237 (2/2) | $0.0250 (2/2) |

</details>

#### Larger project: 4 modifications to an 11-component shop

Whole project in the prompt ("full") vs. what a good agent would read ("focus": ArtScript gets `art context` of the relevant parts, React/Svelte the file list plus the relevant files). Each change is applied to the whole project and the app is used in the simulated browser.

| Stack | USD per solved task, full | USD per solved task, focus | Input tokens/run, full | Input tokens/run, focus | App JS (brotli) |
|---|---|---|---|---|---|
| **ArtScript** | $0.0093 (8/8) | $0.0051 (8/8) | 4311 | 3559 | 2.6 KB |
| React + TS | $0.0163 (8/8) | $0.0119 (8/8) | 3378 | 1430 | 59.2 KB |
| Svelte 5 | $0.0128 (8/8) | $0.0097 (8/8) | 2731 | 1086 | 20.4 KB |
| Vue 3 | $0.0110 (8/8) | $0.0085 (8/8) | 2879 | 1109 | 24.8 KB |
| SolidJS | $0.0190 (8/8) | $0.0102 (8/8) | 4165 | 1132 | 6.3 KB |

Input tokens include ArtScript's ~1.9K-token spec in the system prompt (mostly billed at the cache rate) and every retry.

#### Larger project: 4 modifications to a 42-component admin panel

Whole project in the prompt ("full") vs. what a good agent would read ("focus": ArtScript gets `art context` of the relevant parts, React/Svelte the file list plus the relevant files). Each change is applied to the whole project and the app is used in the simulated browser.

| Stack | USD per solved task, full | USD per solved task, focus | Input tokens/run, full | Input tokens/run, focus | App JS (brotli) |
|---|---|---|---|---|---|
| **ArtScript** | $0.0128 (8/8) | $0.0041 (8/8) | 8180 | 3755 | 2.8 KB |
| React + TS | $0.0246 (8/8) | $0.0086 (8/8) | 9534 | 1429 | 59.6 KB |
| Svelte 5 | $0.0228 (8/8) | $0.0081 (8/8) | 8898 | 1421 | 20.3 KB |
| Vue 3 | $0.0238 (8/8) | $0.0083 (8/8) | 9330 | 1405 | 24.8 KB |
| SolidJS | $0.0261 (8/8) | $0.0091 (8/8) | 10254 | 1486 | 6.8 KB |

Input tokens include ArtScript's ~1.9K-token spec in the system prompt (mostly billed at the cache rate) and every retry.

#### Larger project: 4 modifications to a 102-component admin panel

Whole project in the prompt ("full") vs. what a good agent would read ("focus": ArtScript gets `art context` of the relevant parts, React/Svelte the file list plus the relevant files). Each change is applied to the whole project and the app is used in the simulated browser.

| Stack | USD per solved task, full | USD per solved task, focus | Input tokens/run, full | Input tokens/run, focus | App JS (brotli) |
|---|---|---|---|---|---|
| **ArtScript** | $0.0307 (8/8) | $0.0053 (8/8) | 15874 | 4432 | 3.6 KB |
| React + TS | $0.0506 (8/8) | $0.0099 (8/8) | 22654 | 2110 | 60.9 KB |
| Svelte 5 | $0.0470 (8/8) | $0.0095 (8/8) | 21052 | 2102 | 21.4 KB |
| Vue 3 | $0.0494 (7/7) | $0.0099 (6/6) | 22083 | 2096 | 26.0 KB |
| SolidJS | $0.0543 (6/6) | $0.0101 (6/6) | 24362 | 2229 | 7.8 KB |

Input tokens include ArtScript's ~1.9K-token spec in the system prompt (mostly billed at the cache rate) and every retry.

Run 2026-10-01: 10 tasks × 5 stacks × 2 runs, total $1.09, prices as of 2026-09-25. 2 cell(s) re-run in 2026-10-01T09-58-38-claude-sonnet-5-5.json (the model's first answers there were correct; the failures came from eval-harness bugs, since fixed); 1 cell(s) re-run in 2026-10-01T09-58-42-claude-sonnet-5-5.json (the model's first answers there were correct; the failures came from an ArtScript compiler bug, since fixed); 16 cell(s) re-run in 2026-10-01T13-25-56-claude-sonnet-5-5.json (ArtScript only, after improving `art patch` and the checker with what the previous run showed; React and Svelte are unchanged); 2026-10-01T13-33-05-claude-sonnet-5-5.json: the 102-component admin panel (xl-* tasks); 2026-10-01T13-46-28-claude-sonnet-5-5.json: Vue 3 and SolidJS added; the last task (xl-required) never ran for them because the account ran out of credit, so their xl figures lack it. Raw data: [`benchmarks/eval/results/2026-10-01T08-29-33-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T08-29-33-claude-sonnet-5-5.json), [`benchmarks/eval/results/2026-10-01T09-58-38-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T09-58-38-claude-sonnet-5-5.json), [`benchmarks/eval/results/2026-10-01T09-58-42-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T09-58-42-claude-sonnet-5-5.json), [`benchmarks/eval/results/2026-10-01T13-23-38-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T13-23-38-claude-sonnet-5-5.json), [`benchmarks/eval/results/2026-10-01T13-25-56-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T13-25-56-claude-sonnet-5-5.json), [`benchmarks/eval/results/2026-10-01T13-33-05-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T13-33-05-claude-sonnet-5-5.json), [`benchmarks/eval/results/2026-10-01T13-46-28-claude-sonnet-5-5.json`](benchmarks/eval/results/2026-10-01T13-46-28-claude-sonnet-5-5.json).

### claude-haiku-4-5 (no effort setting)

With `claude-haiku-4-5`, ArtScript cost **29% less** per solved task than React + TS and **51% less** than Svelte 5.

| Stack | Solved | USD per solved task | vs React | Without prompt cache | Avg attempts | Output tokens / run | Final code tokens | App JS (brotli) |
|---|---|---|---|---|---|---|---|---|
| **ArtScript** | 17/20 | **$0.0092** | −29% | $0.0092 | 1.80 | 629 | 329 | 2.0 KB |
| React + TS | 18/20 | $0.0131 | — | $0.0131 | 1.50 | 2001 | 1145 | 58.7 KB |
| Svelte 5 | 16/20 | $0.0190 | +45% | $0.0190 | 1.85 | 2540 | 1019 | 17.8 KB |

```mermaid
xychart-beta
    title "USD per solved task (claude-haiku-4-5)"
    x-axis ["ArtScript", "React + TS", "Svelte 5"]
    y-axis "USD" 0 --> 0.023
    bar [0.0092, 0.0131, 0.0190]
```

<details><summary>Per task</summary>

| Task | ArtScript | React + TS | Svelte 5 |
|---|---|---|---|
| counter | $0.0030 (2/2) | $0.0024 (2/2) | $0.0065 (2/2) |
| todo | $0.0225 (1/2) | ✗ (0/2) | ✗ (0/2) |
| login | $0.0033 (2/2) | $0.0045 (2/2) | $0.0140 (2/2) |
| search | $0.0195 (1/2) | $0.0040 (2/2) | $0.0065 (2/2) |
| cart | $0.0353 (1/2) | $0.0129 (2/2) | $0.0247 (2/2) |
| tabs | $0.0090 (2/2) | $0.0032 (2/2) | $0.0046 (2/2) |
| counter-mod | $0.0075 (2/2) | $0.0021 (2/2) | $0.0024 (2/2) |
| todo-mod | $0.0030 (2/2) | $0.0029 (2/2) | $0.0022 (2/2) |
| fs-users | $0.0046 (2/2) | $0.0438 (2/2) | $0.0571 (1/2) |
| fs-shopping | $0.0095 (2/2) | $0.0186 (2/2) | $0.0782 (1/2) |

</details>

#### Larger project: 1 modifications to an 11-component shop

Whole project in the prompt ("full") vs. what a good agent would read ("focus": ArtScript gets `art context` of the relevant parts, React/Svelte the file list plus the relevant files). Each change is applied to the whole project and the app is used in the simulated browser.

| Stack | USD per solved task, full | USD per solved task, focus | Input tokens/run, full | Input tokens/run, focus | App JS (brotli) |
|---|---|---|---|---|---|
| **ArtScript** | $0.0039 (2/2) | $0.0035 (2/2) | 3435 | 3133 | 2.6 KB |
| React + TS | $0.0049 (2/2) | $0.0072 (2/2) | 2165 | 1125 | 59.1 KB |
| Svelte 5 | $0.0051 (2/2) | $0.0046 (2/2) | 2160 | 1143 | 20.4 KB |

Input tokens include ArtScript's ~1.9K-token spec in the system prompt (mostly billed at the cache rate) and every retry.

Run 2026-10-01: 10 tasks × 3 stacks × 2 runs, total $0.70, prices as of 2026-09-25. 2026-10-01T13-46-55-claude-haiku-4-5.json: cut short when the account ran out of credit: only the 12 tasks that ran for ArtScript, React and Svelte are reported. Raw data: [`benchmarks/eval/results/2026-10-01T13-46-55-claude-haiku-4-5.json`](benchmarks/eval/results/2026-10-01T13-46-55-claude-haiku-4-5.json).

### Methodology and limitations

- Each task is the same functional request for every stack (6 create, 2 modify). Claude gets the task, returns files, and the harness validates them: ArtScript with its compiler, React with strict `tsc`, Svelte with its compiler. Errors are fed back, up to 3 attempts.
- In the 2 modify tasks each stack may use its cheapest edit format: ArtScript an `art patch`, React and Svelte search/replace edit blocks (like a coding agent's Edit tool). Full files are also accepted. Runs before 2026-10-01 had no edit formats: every stack returned full files.
- Cost is computed from the real `usage` the API returns: the ArtScript spec in the system prompt, retries and thinking tokens (billed as output) all count.
- ArtScript's system prompt includes its ~1.2K-token spec, which is served from the prompt cache after the first request; the "without prompt cache" column prices those tokens at the full input rate.
- Since 2026-10-01 every app is also **run and used like a person would**: it's mounted in a simulated browser (happy-dom) and a stack-agnostic check clicks, types and reads the screen (e.g. adds and completes todos, reloads the page to check data persisted on the server). A failed check is fed back to Claude like a compiler error. Earlier runs only checked that code compiled and typechecked.
- Full-stack tasks: React and Svelte also write their own `server.ts` (Node `http`, no dependencies); ArtScript uses `api`. Svelte is validated without TypeScript type checking of `.svelte` files, which favors it.
- Each run uses the ArtScript spec as of its date; older runs are not redone when the spec improves. The runs above used the Spanish version of the spec; it has since been translated to English (about 6% fewer tokens).
- Task prompts (and the feedback given to the model) are in Spanish; they are the fixed dataset these numbers were measured on.
- App JS: each working app bundled with esbuild (minified, production mode) and compressed with brotli: the JavaScript a browser downloads. ArtScript's includes its runtime; React's includes React DOM; Svelte's includes its client runtime.
- 3 runs per task is an early signal, not a definitive benchmark. Reproduce it with `npm run eval`.

<!-- eval-results:end -->

## License

MIT
