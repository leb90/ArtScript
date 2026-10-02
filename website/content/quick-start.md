# Quick start

You need **Node 24** or newer.

## Create an app

```sh
npm create artscript@latest my-app
cd my-app
npm install
npm run dev
```

Open http://localhost:3000. Edit `src/app.art` and save: the page reloads by itself.

To start from a working app instead of a blank page, pick a template:

```sh
npm create artscript@latest my-app -- --template todo
```

| Template | What it shows |
|---|---|
| `todo` | Lists, input binding, filters, components |
| `blog` | Pages with routes, a layout, params, meta tags |
| `users` | A full-stack CRUD: model, api and data |
| `notes` | Accounts, private data and a server function |
| `catalog` | Admin role, search, sorting and pagination |
| `crm` | Relations, uploads, live data and a modal |

## What's in the project

```text
my-app/
  src/app.art        your app: models, apis, pages, components and tests
  public/            static files, copied as they are (images, robots.txt...)
  ARTSCRIPT.md       the language spec, for your AI agent
  ARTSCRIPT-EDIT.md  the short spec for changing existing code
  AGENTS.md          instructions that agents read by themselves (also CLAUDE.md)
  package.json       npm run dev | build | check
```

You can split the app into as many `.art` files as you like, in any folders under `src/`: every declaration is visible from every file. `.css` files are bundled too.

## Your first change

Replace `src/app.art` with:

```art
page Home "/" {
  state name = ""
  state names: String[] = []

  column gap=4 pad=8 {
    title "Guest list"
    row gap=2 {
      input name placeholder="Name" -> { names.push(name); name = "" }
      button "Add" primary -> { names.push(name); name = "" }
    }
    for n in names {
      text n
    }
    text `${names.length} guests` muted
  }
}
```

`input name` binds the input to the `name` state both ways. `->` is the action: on a button it runs on click, on an input when Enter is pressed. Assigning or pushing to a `state` updates the screen; there's nothing else to call.

## Check, test, build

```sh
npx art check          # types and errors, with the fix for each one
npx art test           # the test "..." { } blocks, in a simulated browser
npm run build          # production build in dist/
```

`art build` writes `dist/index.html` and a single minified `app.js`. When the app declares an `api`, it also writes `dist/server.js` (one file, no `node_modules`) and a `Dockerfile`: see [Deploying](/learn/deploy).

## Bring your agent

Open the project in Claude Code, Cursor or any agent: `AGENTS.md` tells it to read `ARTSCRIPT.md` and to check its work with `art check --ai`. To give it the tools directly:

```sh
claude mcp add artscript -- npx art mcp
```

More in [Working with AI agents](/ai/agents). Next, build a full-stack app in the [tutorial](/learn/tutorial).
