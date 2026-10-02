# Testing

Tests in ArtScript describe what a person does and sees, in the same `.art` files as the app. `art test` runs them in a simulated browser, with the real api and a fresh database for each test.

```art
page Todos "/" {
  state todos: String[] = []
  state draft = ""

  input draft placeholder="New task" -> { todos.push(draft); draft = "" }
  for t in todos {
    text t
  }
  text `${todos.length} tasks` muted
}

test "adds a task with Enter" {
  open "/"
  fill "New task" "Buy bread"
  press "New task" "Enter"
  see "Buy bread"
  see "1 tasks"
}
```

```sh
npx art test
```

```text
✓ "adds a task with Enter"

1 passed, 0 failed
```

## Steps

One step per line:

| Step | What it does |
|---|---|
| `open "/path"` | Loads the app at that path (the first step; `open` alone is `/`) |
| `see "text"` | Fails unless the text is on screen |
| `notSee "text"` | Fails if the text is on screen |
| `click "Label"` | Clicks the button with that text; `click "Delete" 2` clicks the third one |
| `link "Label"` | Follows the link with that text |
| `fill "Field" "value"` | Types into the input whose placeholder or label is `Field` |
| `press "Field" "Enter"` | Presses a key in that input |
| `select 0 "Option"` | Picks an option in the first select |
| `check 0` | Toggles the first checkbox |

Steps wait for the page to settle (pending api calls, re-renders) before the next one, so there are no sleeps or retries to write.

## Full-stack tests

Because each test gets a fresh database and the real server, a test can sign up, create data and check that it's there after a reload:

```art
test "keeps notes after reloading" {
  open "/signup"
  fill "Email" "ana@example.com"
  fill "Password" "12345678"
  click "Create account"
  fill "New note" "Remember the milk"
  click "Save"
  open "/"
  see "Remember the milk"
}
```

## Why tests matter more with AI

A test is the cheapest way to tell a model what "done" means, and to know that a later change didn't break it. A failing step says what it expected and what the screen shows (or which buttons and inputs exist), which is usually enough for the agent to fix it in one step. Ask your agent to write tests for the main flows and to run `art test` after each change.
