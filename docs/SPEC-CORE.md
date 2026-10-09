# ArtScript — core spec

A web language that compiles to JavaScript. Files are `.art`. **Expressions and statements are JavaScript** (`let`, `if`, `for`, `while`, `break`, `return`, `try/catch`, arrows, destructuring, template strings, every operator); only the structure below is new. `==` compiles to `===`.

## A whole app

```
model Task {
  id: ID
  title: String min=1
  done: Bool = false
}

api tasks: Task                       // REST + storage, validated against the model

page Home "/" {
  state draft = ""
  data tasks = api.tasks.list()       // loads on mount, reloads after every write
  computed open = tasks.filter(t => !t.done)
  fn add() {
    if draft.trim() == "" { return }
    api.tasks.create({ title: draft })
    draft = ""
  }

  column gap=4 {
    title "Tasks"
    row gap=2 {
      input draft placeholder="What needs doing?" -> add()
      button "Add" primary -> add()
    }
    if tasks.length == 0 {
      text "Nothing yet" muted
    } else {
      for t in tasks key t.id {
        row gap=2 align=center {
          checkbox t.done -> api.tasks.update(t.id, { done: t.done })
          text t.title muted=t.done
          button "x" small -> api.tasks.remove(t.id)
        }
      }
    }
    text `${open.length} open` small
  }
}

test "adds a task" {
  fill "What needs doing?" "Milk"
  press "What needs doing?" "Enter"
  see "Milk"
}
```

## Structure

- `model Name { field: Type ... }`: types `String Number Bool ID Email Date Fn Any File`, `T[]`, `T?`; rules `min= max= match= unique`; default `= literal`.
- `page Name "/path" { }` (`"/items/:id"` gives `params.id`; `"*"` catches the rest), `component Name(prop: Type, cb: Fn, flag: Bool = false) { }`, `layout Main { ... slot ... }`.
- `use "pkg" { a, b }`, `use "pkg" as x`, `use "./lib/engine.ts" { step }`: npm or your own JS/TS, typed `Any`. **Heavy imperative code (a physics loop, a parser, canvas drawing) goes in a `.ts` file imported this way: plain TypeScript, no restrictions.**
- Members, before the view: `state x = 0` (reactive; `state xs: Item[] = []`), `computed y = expr`, `data xs = api.x.list()`, `fn name(a) { }`, `ref el` (an element or any non-reactive value), `mount { }` (once in the page; `cleanup { }` inside runs on unmount), `effect { }` (re-runs when the states it reads change).
- Assigning a state (or a field of one, also through a fn parameter) updates the UI. No hooks, setters or dependency lists.
- Members written outside any component are shared by all of them.

## View: one element per line

`tag content prop=value flag -> action { children }` — a prop value is a literal, a name, `a.b`, a call, or `(expression)`.

| Element | Content | `->` | Props / flags |
|---|---|---|---|
| `text` `title` | text | | bold muted small large danger; `tag=h1|p|…` |
| `button` | text | click | disabled; primary danger small |
| `input` `textarea` | state (two-way) | Enter | placeholder type label disabled; required |
| `select` `radio` `tabs` | state | change | options=[...] label |
| `checkbox` | Bool state | change | label |
| `file` | File state | change | accept; multiple |
| `modal` | Bool state (open) | | gap pad |
| `image` `video` `audio` | src | | alt width height; controls |
| `link` | text or `{ }` | | to="/path" href target |
| `badge` `icon` `spinner` `divider` | text / lucide name | | primary success danger |
| `row` `column` `card` `grid` `form` | — | form: submit | gap pad align justify cols; row: wrap |
| `list` > `item`, `table` > `tr` > `th` `td` | text | item/tr: click | |
| `canvas` | — | | width height |

- Every element takes `class style id role aria-* data-* tabindex`. `gap=4` = 16px. Responsive: `grid cols=1 md:cols=3`.
- Conditional flag: `text t.title muted=t.done`. Other events: `card on:mouseenter=(hover = true)` (`event` is available).
- `if cond { } else if { } else { }` and `for x, i in xs key x.id { }` inside the view.
- Component use: `UserCard user=u onDelete=(id => remove(id))`; its children go where it puts `slot`.
- Multi-statement action: `-> { a(); b = 1 }`.

## Backend

- `api items: Item` → `api.items.list({ where, search, sort: "-price", limit, offset })`, `count()`, `get(id)` (`T?`), `create(obj)`, `update(id, changes)`, `remove(id)`. `login` / `private` / `admin` / `readonly` after the model restrict access (`api notes: Note private`: rows per user, model needs `owner: ID`).
- `auth users` (model with `email: Email`, `password: String`): `auth.signup(obj)`, `auth.login(email, password)`, `auth.logout()`, `data me = auth.me()`.
- `server fn name(a) { ... }` runs on the server with `db.<api>`, `me`, `fail("msg")`; call it as `server.name(a)`.
- Relations: `author: User` stores the id and reads the row (`post.author.name`).

## An animation on a canvas

```
use "./sim.ts" { make, step, draw }   // the physics: plain TypeScript

page Sim "/" {
  state balls: Any[] = []
  state frames = 0
  state paused = false
  ref cv
  fn tick() {
    if !paused {
      step(balls)
      draw(cv, balls)
      frames++
    }
    requestAnimationFrame(tick)
  }
  mount {
    balls = Array.from({ length: 5 }, () => make())
    requestAnimationFrame(tick)
  }

  column gap=2 {
    canvas ref=cv id="sim" width=400 height=300
    text `Frames: ${frames}`
    button paused ? "Resume" : "Pause" -> paused = !paused
  }
}
```

## The compiler checks

- `list.find(...)` and `api.x.get(id)` are `T?`: use `?.`, `??` or `if x { }` first.
- Objects passed as a model need every required field and no extra ones.
- Unknown names, elements, props and flags are errors with a suggestion; `art check --ai` returns them as JSON with the fix.
