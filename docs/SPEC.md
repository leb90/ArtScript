# ArtScript v0.1 — Spec for AI

A web language that compiles to JavaScript. Files are `.art`. Expressions are JavaScript; only the structure is new.

## Declarations (top level)

```
model User {
  id: ID
  name: String
  bio: String?
  tags: String[]
}

component UserCard(user: User, onDelete: Fn, big: Bool = false) {
  ...members and view
}

page Users "/users" {
  ...members and view
}
```

- Types: `String Number Bool ID Email Date Fn Any`, `model` names, `T[]` list, `T?` optional (may be null).
- Field rules, enforced by the server: `name: String min=2 max=50` (length; for a Number, its value; for a list, its size), `code: String match="^[A-Z]{3}$"`, `email: Email unique`.
- `page Product "/products/:id"`: a component with a route; inside it `params.id` (String) and `query.tab` (from `?tab=`). `page NotFound "*"` catches unknown paths. Without a route: `/lowercase-name`.
- `layout Main { ... slot ... }` wraps pages and stays mounted while they change (the only layout applies to every page; `page X "/x" layout Main` picks one). `link "x" to="/path"` and `navigate("/path")` change pages without reloading.

## Imports: `use`

```
use "date-fns" { format, addDays }      // npm package (install it with npm first)
use "canvas-confetti" as confetti       // default export
use "./lib/money.ts" { toUSD }          // your own JS/TS module: the way out for anything not built in
```

- Imported names work in every component and server fn; their values are typed `Any`.
- A missing module or name is a compile error with a fix (`npm install ...`, the closest export).

## Members (inside component/page, before the view)

```
state count = 0                  // reactive; type inferred
state users: User[] = []         // explicit type
computed total = count * 2       // derived; assigning it overrides it until count changes
fn add(x) {                      // function; body = JS statements
  if x == "" { return }
  users.push({ id: crypto.randomUUID(), name: x, tags: [] })
}
```

- Assigning to a `state` updates the UI: `count++`, `name = "x"`, `users.push(u)`, `user.name = "x"`, also through a fn parameter (`fn sell(p) { p.stock-- }`).
- A component that assigns its prop (`items = items.filter(...)`) changes the parent's state: pass a state (`List items=items`).
- No hooks, setters or manual dependencies.
- Statements: expression, `let x = ...`, `if cond { } else { }`, `return`, `try { } catch (e) { }`.
- Only for DOM libraries (charts, maps, editors), timers and subscriptions:
  ```
  ref box                          // the element marked `ref=box` (set before mount runs)
  mount {                          // once, when the view is in the page
    let chart = new Chart(box, { data: points })
    cleanup { chart.destroy() }    // on unmount
  }
  effect {                         // re-runs when the states it reads change
    document.title = `${count} items`
  }
  ```

## Backend: `api` and `data`

```
api users: User                    // REST at /api/users: validated against the model, data stored
```

- The model needs an `ID` field (if `create` omits it, the server assigns it).
- Relations: in a stored model, `author: User` (or `tags: Tag[]`) stores the id; create/update take the row or its id (`author: me`, `author: id`), reads return the row (`post.author.name`), `where: { author: id }` filters. Deleting a referenced row fails (409) unless the field is `cascade` (`post: Post cascade` deletes the comments with their post).
- Typed client in any component: `api.users.list(query?)`, `count(query?)`, `get(id)`, `create(obj)`, `update(id, changes)`, `remove(id)`.
- Query: `list({ where: { active: true }, search: "pan", sort: "-price", limit: 20, offset: 40 })` (`sort`: field, `-` = descending; `search`: text fields contain it). `count({ where, search })`. Inside `data`, they re-run when the states they use change (e.g. `offset: page * 20`).
- `data users = api.users.list()` loads on mount and **reloads by itself** after any write. A list starts as `[]`, a count as `0`; `get` starts as `null` (`T?`).
- `users.loading` is true until the first response; `users.error` is the last error's message or `null`; `users.reload()` fetches again.
- `await` and `try { } catch (e) { }` work as in JS; `e.message` explains a validation error.
- Access: `api notes: Note login` requires a session; `private` also scopes rows per user (the model needs `owner: ID`, filled in automatically); `admin`: anyone reads, only admins write (the accounts model needs `role: String`; the first account is "admin", later ones "user"; only admins change roles).
- `auth users` (the model needs `email: Email` and `password: String`): `auth.signup(obj)`, `auth.login(email, password)`, `auth.logout()`, `data me = auth.me()` (`T?`). Passwords are stored hashed and never returned.
- `server fn name(a, b) { ... }` runs on the server; call it as `server.name(a, b)` (also in `data`). Inside: `db.<api>` (no `await`, not scoped per user), `me` (logged-in user or `null`) and `fail("message", status?)`.
- After any write, login or logout, every `data` reloads.
- Data is stored in SQLite (built into Node). `art dev` serves the api; `art build` emits `dist/server.js` (`node dist/server.js`).

## View

One line per element: `tag content prop=value flag -> action { children }`

```
column gap=4 align=center {
  title "Users"
  text `Total: ${total}` muted
  input draft placeholder="Name" -> add(draft)
  button "Add" primary -> add(draft)
  if users.length == 0 {
    text "Empty"
  } else {
    for u, i in users {
      UserCard user=u onDelete=(id => users = users.filter(x => x.id != id))
    }
  }
}
```

| Element | Content | `->` fires on | Props | Flags |
|---|---|---|---|---|
| `text` | text | — | | bold muted small large danger |
| `title` | text | — | | muted small large |
| `button` | text | click | disabled | primary danger small |
| `input` | **state to bind** (two-way) | Enter | placeholder type disabled label | required |
| `textarea` | state to bind | — | placeholder rows disabled label | required |
| `select` | state to bind | change | **options** placeholder disabled label | |
| `radio` `tabs` | state to bind | change | **options** label | |
| `checkbox` | Bool state | change | label disabled | |
| `file` | state (`File`, or list with `multiple`) | change | accept label disabled | multiple |
| `modal` | Bool state (open) | — | gap pad align justify | |
| `image` | src | — | alt width height | |
| `video` `audio` | src | — | video: width height poster | controls autoplay loop muted |
| `link` | text | — | to href | muted |
| `badge` | text | — | | primary success danger |
| `spinner` `divider` | — | — | | |
| `row` `column` `card` | — | — | gap pad align justify | row: wrap |
| `grid` | — | — | gap pad align justify cols | |
| `form` | — | submit | gap pad align justify | |
| `list` > `item` | item: text | item: click | | item: muted |
| `table` > `tr` > `th` `td` | th/td: text | tr: click | | td: muted |

- All take `class style id`.
- Conditional flag: `text t.title muted=t.done` applies the flag while the value is `true`.
- `gap=4` and `pad=4`: 1 unit = 4px. `align=start|center|end|stretch`. `justify=start|center|end|between|around`. `cols=3`.
- `type=text|number|email|password|checkbox|date`. With `type=checkbox`, `input` binds a Bool.
- `options=["S", "M"]` or a list of objects (`value`/`id` and `label`/`name`); the state gets the option's value with its type. `label="Email"` adds a visible label. `modal open { ... }` shows while `open` is true; Esc or the backdrop set it to false.
- `item`, `th`, `td` take text and/or `{ children }`.
- Prop values: literal, name, `a.b`, call, or `( expression )` in parentheses.
- Component: `Name prop=value`. Capitalized name. Children: `Card title="x" { ... }` render where the component puts `slot`.
- Events besides `->`: `on:<event>=statement`, with `event` available: `input q on:keydown=(event.key == "Escape" ? q = "" : null)`, `card on:mouseenter=(hover = true)`.
- `for p in products key p.id { }`: rows are matched by key (default: the item itself) and keep their DOM, focus and input state across updates.
- Responsive: `grid cols=1 md:cols=3 lg:gap=6` (`sm` 640px, `md` 768, `lg` 1024, `xl` 1280; `cols`, `gap`, `pad`; numbers).
- If a component receives a model as a prop and changes a field (`todo.done = true`), the owning state updates by itself.
- Multi-statement action: `-> { a(); b = 1 }`.

## Expressions

JavaScript: literals, `` `template ${x}` ``, `a.b`, `a?.b`, `a[i]`, `f(x)`, `x => x * 2`, `{ a, ...b }`, `[...xs]`, `? :`, `??`, `&&`, `||`.
`==` and `!=` compile to `===` and `!==`. A line starting with `?`, `:`, `.`, `&&`, `||` or `??` continues the previous expression (multi-line ternaries and chains). JS globals are available: `Math JSON Date crypto fetch console localStorage`, etc.

## Rules the compiler checks

- `list.find(...)` and `api.x.get(id)` are `T?`: use `?.field`, `?? value` or `if x { }`.
- Inside `if x { }`, `if x != null`, `x && ...`, `x ? ... : ...` or after `if !x { return }`, `x` is no longer null.
- Objects passed as a `model` need every non-optional field and no extra fields.
- Unknown names, elements, props and flags → error with a suggestion.

## Changing existing code: `art patch`

To change code that already exists, answer with a ```` ```patch ```` block instead of rewriting files:

```patch
replace Todos/column/title
  title "My tasks"
insert after Todos/column/row
  text "Type and press Enter" muted
append Todos
  fn clearDone() {
    todos = todos.filter(t => !t.done)
  }
set Todos/column gap=6 -align
remove Todos/column/if/else/text
```

- Operations: `replace`, `insert before`, `insert after`, `append` (children of a node, members/view of a component, or fields of a model), `remove`, `set` (props on the same line; `-name` removes one), `add [file.art]` (new declarations).
- New component props without rewriting it: `set Row onRemove: Fn, compact: Bool = false`.
- Paths: `Component/tag/tag[n]` (n = 0-based index among siblings with the same tag; also `if`, `for`, `if/else`), `Component.member`, `Model.field`. `art context Component` shows its source (paths follow the view structure).
- Applied in order and atomic: if anything fails, nothing changes.

## Tools

```
art check --ai        errors as JSON: {"code","type","loc","expr","expected","actual","fixes"}
art context [Name...] compact context of components (or the project map)
art fmt --write       canonical format
art build | art dev   build | dev server with reload
```
