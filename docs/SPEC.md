# ArtScript — Spec for AI

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

- Types: `String Number Bool ID Email Date Fn Any File`, `model` names, `T[]` list, `T?` optional (may be null).
- Field rules, enforced by the server: `name: String min=2 max=50` (length; for a Number, its value; for a list, its size), `code: String match="^[A-Z]{3}$"`, `email: Email unique`.
- Defaults: `stock: Number = 0` (a literal); `create` may omit the field.
- Files: `photo: File? max=2000000 accept="image/*"` (max in bytes). Pass the File from `file picked` straight to `create`/`update`: it's uploaded and stored as `{ url, name, type, size }` (`image post.photo.url`).
- Changing a stored model needs no migration code; a new required field needs a default (or `?`); a renamed one: `title: String was="name"`.
- `page Product "/products/:id"`: a component with a route; inside it `params.id` (String) and `query.tab` (from `?tab=`). `page NotFound "*"` catches unknown paths. Without a route: `/lowercase-name`.
- `meta title="..." description="..." image="/og.png"` in a page sets its title, description and Open Graph tags.
- `layout Main { ... slot ... }` wraps pages and stays mounted while they change (the only top-level layout applies to every page; `page X "/x" layout Main` picks one; `layout Docs layout Main` goes inside Main). Links to the current page get `aria-current="page"`. `link "x" to="/path"` and `navigate("/path")` change pages without reloading. `notify("Saved", "success")` shows a short message (`info`, `success`, `danger`). `page Admin "/admin" requires admin` (or `requires login`) only shows to them (others go to `/login` or `/`). `setTheme("dark" | "light" | "auto")`, `theme()`.

## Imports: `use`

```
use "date-fns" { format, addDays as plus } // npm package (install it with npm first)
use "canvas-confetti" as confetti       // default export
use "./lib/money.ts" { toUSD }          // your own JS/TS module: the way out for anything not built in
```

- Imported names work in every component and server fn, typed `Any`.

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
- For DOM libraries (charts, maps), timers and subscriptions:
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
- Relations: `author: User` (or `tags: Tag[]`) in a stored model stores the id; writes take the row or its id, reads return the row (`post.author.name`; deeper with `list({ include: ["post.author"] })`), `where: { author: id }` filters. Deleting a referenced row fails unless the field is `cascade` (`post: Post cascade`).
- Typed client in any component: `api.users.list(query?)`, `count(query?)`, `get(id)`, `create(obj)`, `update(id, changes)`, `remove(id)`.
- Query: `list({ where: { active: true }, search: "pan", sort: "-price", limit: 20, offset: 40 })` (`-` = descending; `search` matches text fields); `count({ where, search })`. Inside `data` they re-run when the states they use change (`offset: page * 20`).
- `data users = api.users.list()` loads on mount and **reloads by itself** after any write, login or logout. A list starts as `[]`, a count as `0`, `get` as `null` (`T?`). `users.loading` (until the first response), `users.error` (message or `null`), `users.reload()`. `... live` also reloads when someone else writes.
- `await` and `try { } catch (e) { }` work as in JS; `e.message` explains a validation error.
- Access: `api notes: Note login` needs a session; `private` also scopes rows per user (the model needs `owner: ID`, filled in); `admin`: anyone reads, admins write (accounts need `role: String`; the first account is "admin", later ones "user").
- `auth users` (the model needs `email: Email` and `password: String`): `auth.signup(obj)`, `auth.login(email, password)`, `auth.logout()`, `auth.logoutAll()`, `data me = auth.me()` (`T?`). `auth users with google, github`: `auth.loginWith("google")`.
- `auth.requestReset(email)` emails a link to `/reset-password?token=...`, a page that calls `auth.resetPassword(query.token, password)`. With `verified: Bool` in the model, sign-up emails `/verify-email?token=...` (`auth.verifyEmail(query.token)`).
- `server fn name(a, b) { ... }` runs on the server; call it as `server.name(a, b)` (also in `data`). Inside: `db.<api>` (no `await`, not scoped per user), `me` (logged-in user or `null`), `fail("message", status?)` and `await email(to, subject, text)`.
- `server job cleanup every "1h" { ... }` (`s m h d`): on the server, with `db`, `fail`, `email`.

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
| `icon` | Lucide name (`"check" "trash" "edit" "search" "user" "home"`...) | — | size label | muted primary success danger |
| `spinner` `divider` | — | — | | |
| `row` `column` `card` | — | — | gap pad align justify | row: wrap |
| `grid` | — | — | gap pad align justify cols | |
| `form` | — | submit | gap pad align justify | |
| `list` > `item` | item: text | item: click | | item: muted |
| `table` > `tr` > `th` `td` | th/td: text | tr: click | | td: muted |

- All take `class style id`. `style { .box { ... } }` in a component: CSS only for its elements. `.css` files in the project are bundled; theme: `:root { --a-primary: #e11d48; --a-radius: 4px; --a-font: Inter }` (also `--a-bg --a-fg --a-surface --a-border --a-muted --a-danger --a-success`).
- Conditional flag: `text t.title muted=t.done`.
- `gap=4` and `pad=4`: 1 unit = 4px. `align=start|center|end|stretch`. `justify=start|center|end|between|around`. `cols=3`.
- `type=text|number|email|password|checkbox|date`. With `type=checkbox`, `input` binds a Bool.
- `options=["S", "M"]` or objects (`value`/`id`, `label`/`name`); the state gets the option's value. `label="Email"` adds a visible label. `modal open { ... }` shows while `open` is true (Esc or the backdrop set it to false).
- `item`, `th`, `td`, `link` take text and/or `{ children }` (`link to="/p/1" { card { ... } }`).
- Prop values: literal, name, `a.b`, call, or `( expression )` in parentheses.
- Component: `Name prop=value`. Children `Card { ... }` go where it puts `slot`; `slot header` is filled by `Card { header { ... } }`. `onPick: Fn(User)` types a callback (`onPick=(u => ...)` gets `u: User`).
- Other events: `on:<event>=statement` with `event`: `card on:mouseenter=(hover = true)`, `input q on:keydown=(event.key == "Escape" ? q = "" : null)`.
- `for p in products key p.id { }`: rows matched by key keep their DOM and focus.
- Responsive: `grid cols=1 md:cols=3 lg:gap=6` (`sm md lg xl` = 640/768/1024/1280px; `cols gap pad`).
- Multi-statement action: `-> { a(); b = 1 }`.

## Tests

`test "adds a task" {` then one step per line, `}`; `art test` runs them in a simulated browser. Steps: `open "/path"`, `see "x"`, `notSee "x"`, `click "Label" [n]`, `link "Label"`, `fill "Placeholder" "value"`, `press "Placeholder" "Enter"`, `select 0 "Option"`, `check 0`.

## Expressions

JavaScript: literals, `` `template ${x}` ``, `a.b`, `a?.b`, `a[i]`, `f(x)`, `x => x * 2`, `{ a, ...b }`, `[...xs]`, `? :`, `??`, `&&`, `||`.
`==` and `!=` compile to `===` and `!==`. A line starting with `?`, `:`, `.`, `&&`, `||` or `??` continues the previous one. JS globals work (`Math JSON Date crypto fetch localStorage`...).

## Rules the compiler checks

- `list.find(...)` and `api.x.get(id)` are `T?`: use `?.field`, `?? value` or `if x { }`.
- Inside `if x { }`, `if x != null`, `x && ...`, `x ? ... : ...` or after `if !x { return }`, `x` is no longer null.
- Objects passed as a `model` need every non-optional field and no extra fields.
- Unknown names, elements, props and flags → error with a suggestion.

## Changing existing code

Answer with a ```` ```patch ```` block instead of rewriting files: `replace Todos/column/title` with the new code indented below it; also `insert before|after <path>`, `append <path>`, `remove <path>`, `set Todos/column gap=6`, `add` (paths: `Component/tag/tag[n]`, `Component.member`, `Model.field`). The full format is in SPEC-EDIT.md.
