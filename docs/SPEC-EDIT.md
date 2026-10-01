# ArtScript — spec for changing existing code

The code you are given shows the syntax; this covers what it doesn't. Expressions are JavaScript (`==` compiles to `===`).

## Answer with a patch

```patch
replace Todos/column/title
  title "My tasks"
insert after Todos/column/row
  text "Type and press Enter" muted
append Todos
  state filter = "all"
  fn clearDone() {
    todos = todos.filter(t => !t.done)
  }
replace Todos.add
  fn add() {
    todos.push({ id: crypto.randomUUID(), title: draft, done: false })
  }
set Todos/column gap=6 -align
set TodoItem compact: Bool = false
remove Todos/column/if/else/text
```

- Operations: `replace`, `insert before|after`, `append` (children of a node; members or view of a component; fields of a model), `remove`, `set` (props on the same line, `-name` removes), `add` (new declarations, indented).
- View paths: `Component/tag/tag[n]` (`n` = 0-based among siblings with the same tag; `if`, `else`, `for` are segments). Members: `Component.name`. Fields: `Model.field`.
- `set Component name: Type` adds a prop to a component without rewriting it; then pass it where it's used.
- Bodies are indented under their operation. Applied in order, all or nothing.

## Members

`state x = 0` · `state xs: Item[] = []` · `computed total = a * 2` · `fn name(a, b) { ... }` · `data items = api.items.list()`

- Assigning updates the screen: `x++`, `xs.push(i)`, `item.done = true` (also on a prop or a fn parameter).
- A `computed` can be assigned; it keeps that value until what it reads changes.
- A component that assigns its own prop (`items = items.filter(...)`) changes the parent's state: pass a state (`List items=items`). Or pass a callback: `onRemove=(id => items = items.filter(i => i.id != id))`.
- `xs.find(...)` and `api.x.get(id)` may be null: `?.`, `??` or `if x { }`.

## View

`tag content prop=value flag -> action { children }`, one element per line.

- Elements: `text title button input textarea select radio tabs checkbox file modal image link badge spinner divider row column card grid form list item table tr th td`, and components (`Name prop=value`).
- `button "x" -> action` (click), `input state -> action` (Enter; binds the state), `form { } -> action` (submit), `select x options=[...]`.
- Flags: `text`/`title`: `bold muted small large danger primary success`; `button`: `primary danger small`. Conditional flag: `muted=t.done`.
- Layout props: `gap=4 pad=4` (×4px), `align=start|center|end`, `justify=start|center|end|between`, `cols=3`.
- Prop values: literal, name, `a.b`, call, or `(any expression)`. Multi-statement action: `-> { a(); b = 1 }`.
- Control flow: `if cond { } else { }`, `for item, i in list { }`.
- Unknown names, elements, props and flags are compile errors with a suggested fix.
