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
- `page` = component with a route (hash routing: `#/users`). Without a route: `/lowercase-name`. Unknown route → first page.

## Members (inside component/page, before the view)

```
state count = 0                  // reactive; type inferred
state users: User[] = []         // explicit type
computed total = count * 2       // derived, read-only
fn add(x) {                      // function; body = JS statements
  if x == "" { return }
  users.push({ id: crypto.randomUUID(), name: x, tags: [] })
}
```

- Assigning to a `state` updates the UI: `count++`, `name = "x"`, `users.push(u)`, `user.name = "x"`.
- No hooks, setters or manual dependencies.
- Statements: expression, `let x = ...`, `if cond { } else { }`, `return`, `try { } catch (e) { }`.

## Backend: `api` and `data`

```
api users: User                    // REST at /api/users: validated against the model, data stored
```

- The model needs an `ID` field (if `create` omits it, the server assigns it).
- Typed client in any component: `api.users.list(query?)`, `count(query?)`, `get(id)`, `create(obj)`, `update(id, changes)`, `remove(id)`.
- Query: `list({ where: { active: true }, search: "pan", sort: "-price", limit: 20, offset: 40 })` (`sort`: field, `-` = descending; `search`: text fields contain it). `count({ where, search })`. Inside `data`, they re-run when the states they use change (e.g. `offset: page * 20`).
- `data users = api.users.list()` loads on mount and **reloads by itself** after any write. A list starts as `[]`, a count as `0`; `get` starts as `null` (`T?`).
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
| `text` | text | — | | bold muted small large |
| `title` | text | — | | muted small large |
| `button` | text | click | disabled | primary danger small |
| `input` | **state to bind** (two-way) | Enter | placeholder type disabled | |
| `image` | src | — | alt width height | |
| `link` | text | — | to href | muted |
| `row` `column` `card` | — | — | gap pad align justify | row: wrap |
| `grid` | — | — | gap pad align justify cols | |
| `form` | — | submit | gap pad align justify | |

- All take `class style id`.
- Conditional flag: `text t.title muted=t.done` applies the flag while the value is `true`.
- `gap=4` and `pad=4`: 1 unit = 4px. `align=start|center|end|stretch`. `justify=start|center|end|between|around`. `cols=3`.
- `type=text|number|email|password|checkbox|date`. With `type=checkbox`, `input` binds a Bool.
- Prop values: literal, name, `a.b`, call, or `( expression )` in parentheses.
- Component: `Name prop=value`. Capitalized name.
- If a component receives a model as a prop and changes a field (`todo.done = true`), the owning state updates by itself.
- Multi-statement action: `-> { a(); b = 1 }`.

## Expressions

JavaScript: literals, `` `template ${x}` ``, `a.b`, `a?.b`, `a[i]`, `f(x)`, `x => x * 2`, `{ a, ...b }`, `[...xs]`, `? :`, `??`, `&&`, `||`.
`==` and `!=` compile to `===` and `!==`. A line starting with `?`, `:`, `.`, `&&`, `||` or `??` continues the previous expression (multi-line ternaries and chains). JS globals are available: `Math JSON Date crypto fetch console localStorage`, etc.

## Rules the compiler checks

- `list[i]` is `T?`: use `list[i]?.field` or `?? value`.
- Inside `if x { }`, `if x != null`, `x && ...`, `x ? ... : ...` or after `if !x { return }`, `x` is no longer null.
- Objects passed as a `model` need every non-optional field and no extra fields.
- `computed` values and props can't be assigned directly.
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
- Paths: `Component/tag/tag[n]` (n = 0-based index among siblings with the same tag; also `if`, `for`, `if/else`), `Component.member`, `Model.field`. `art context Component` shows its source (paths follow the view structure).
- Applied in order and atomic: if anything fails, nothing changes.

## Tools

```
art check --ai        errors as JSON: {"code","type","loc","expr","expected","actual","fixes"}
art context [Name...] compact context of components (or the project map)
art fmt --write       canonical format
art build | art dev   build | dev server with reload
```
