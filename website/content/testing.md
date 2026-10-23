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
| `respond "https://api.example.com/*" 200 { "ok": true }` | What a request to that address gets for the rest of the test (status and body are optional: `200`, `{}`) |

Steps wait for the page to settle (pending api calls, re-renders) before the next one, so there are no sleeps or retries to write. An error the page doesn't catch (a failed request in an event handler without `try`) fails the test with `the page threw: ...`.

A test never reaches another site: a form that emails through a service would send mail on every run. A request to another origin fails, and the error says which `respond` step to add. Requests to the app's own api go to the test's server as usual.

A label written by `Intl` (`10,00 €` has a no-break space) matches the same text typed with a normal space.

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

## With a server of your own

If the app runs on a server of its own (another database, your own messages), point the tests at it: the page's api requests go there, and the tests check what that server answers.

```sh
npx art test --api http://localhost:8787 --reset /api/_test/reset
```

`--reset` names a path of your server that gets a `POST` before each test, to start from clean data; without it, the tests share that server's data. That route empties a database, so make it exist only when the server runs for the tests (an environment variable and a database of its own), never in production.

The requests reach your server as the page sent them, with the page's `Host`, so checks that compare `Origin` or `Referer` with `Host` let the page's writes through.

## Why tests matter more with AI

A test is the cheapest way to tell a model what "done" means, and to know that a later change didn't break it. A failing step says what it expected and what the screen shows (or which buttons and inputs exist), which is usually enough for the agent to fix it in one step. Ask your agent to write tests for the main flows and to run `art test` after each change.
