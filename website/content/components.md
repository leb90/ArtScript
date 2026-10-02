# Components and state

A `component` (or a `page`, which is a component with a route) has **members** first and its **view** after them. Members hold the data and the logic; the view is one line per element.

```art
component Greeting(name: String, excited: Bool = false) {
  computed message = excited ? `Hello, ${name}!` : `Hello, ${name}`

  text message bold
}
```

## State

`state` declares reactive data. Its type is inferred from the value, or written explicitly:

```art
state count = 0
state draft = ""
state users: User[] = []
state selected: User? = null
```

Assigning to a state updates the screen, and so does changing it in place:

```art
count++
draft = ""
users.push({ id: crypto.randomUUID(), name: "Ana" })
users[0].name = "Bea"
users = users.filter(u => u.id != id)
```

There are no setters, hooks or dependency arrays. The compiler knows which states a line reads and updates exactly those DOM nodes.

## Computed values

`computed` derives a value from states, and recomputes when they change:

```art
computed total = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
computed empty = cart.length == 0
```

Assigning a computed overrides it until one of its dependencies changes, which is handy for editable defaults.

## Functions

`fn` bodies are JavaScript statements: expressions, `let`, `if`/`else`, `return`, `try`/`catch` and `await`. Conditions don't need parentheses.

```art
fn add(title) {
  if title.trim() == "" {
    return
  }
  todos.push({ id: crypto.randomUUID(), title, done: false })
  draft = ""
}
```

Parameters may have defaults (`fn load(page = 0)`). Changing a state through a parameter works too: `fn sell(p) { p.stock-- }`.

## The view

Each line is `element content prop=value flag -> action { children }`:

```art
column gap=4 align=center {
  title "Tasks"
  input draft placeholder="New task" -> add(draft)
  button "Add" primary disabled=(draft == "") -> add(draft)
  text `${pending} pending` muted
}
```

- **Content** is the first value: the text of a `text` or `button`, the state an `input` binds to, the source of an `image`.
- **Props** are `name=value`. A value is a literal, a name, `a.b`, a call, or any expression in parentheses.
- **Flags** are bare words (`primary`, `muted`, `bold`). `muted=t.done` turns one on with a condition.
- **`->`** is the element's action: click for buttons, Enter for inputs, change for selects, submit for forms. Several statements go in braces: `-> { save(); open = false }`.

The full list of elements, with their props and flags, is in [UI elements](/reference/elements).

## Conditions and lists

```art
if users.loading {
  spinner
} else if users.length == 0 {
  text "No users yet" muted
} else {
  for u, i in users key u.id {
    UserRow user=u position=i
  }
}
```

`key` matches rows by identity, so rows that stay keep their DOM, their focus and their scroll.

## Props

Props are typed, and may have defaults. A callback is `Fn`, or `Fn(User)` to type its argument:

```art
component UserRow(user: User, position: Number = 0, onPick: Fn(User)) {
  row gap=2 on:click=(onPick(user)) {
    text `${position + 1}.` muted
    text user.name
  }
}
```

Use it like an element: `UserRow user=u onPick=(u => selected = u)`.

A component that assigns one of its props (`items = items.filter(...)`) changes the parent's state: pass it a state, and it's bound two ways.

## Children and slots

A component places its children where it writes `slot`. Named slots take named blocks:

```art
component Panel(heading: String) {
  card gap=3 pad=5 {
    row justify=between {
      title heading small
      slot actions
    }
    slot
  }
}

page Settings "/settings" {
  Panel heading="Profile" {
    actions {
      button "Save" primary -> save()
    }
    text "Your public information." muted
  }
}
```

## Events

`->` covers the main action. Any other DOM event is `on:<event>=statement`, with `event` in scope:

```art
card on:mouseenter=(hover = true) on:mouseleave=(hover = false) {
  text "Hover me"
}
input q on:keydown=(event.key == "Escape" ? q = "" : null)
```

## The DOM, timers and libraries

`ref` names an element; `mount` runs once the view is in the page; `effect` re-runs when the states it reads change; `cleanup` runs on unmount.

```art
use "chart.js/auto" as Chart

component Sales(points: Number[]) {
  ref canvas

  mount {
    let chart = new Chart(canvas, { type: "line", data: { labels: points.map((_, i) => i), datasets: [{ data: points }] } })
    cleanup {
      chart.destroy()
    }
  }
  effect {
    document.title = `${points.length} points`
  }
  column ref=canvas
}
```

See [JavaScript libraries](/learn/libraries) for `use`.

## Null safety

Values that may be missing have a `?` type: `list.find(...)`, `api.x.get(id)`, `auth.me()`. The compiler asks you to handle the missing case with `?.`, `??`, or a condition that narrows it:

```art
computed user = users.find(u => u.id == selectedId)

if user {
  text user.name
}
text user?.email ?? "Nobody selected" muted
```
