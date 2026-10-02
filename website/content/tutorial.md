# Tutorial: a full-stack app

We'll build **a reading list**: people sign up, add the books they want to read, mark them as read and filter them. It has a database, a REST api, accounts, private data, two pages and tests, in one file of about 100 lines.

Create a project (see the [quick start](/learn/quick-start)) and replace `src/app.art` step by step. Run `npm run dev` and keep the page open: it reloads on every save.

## 1. The data

A `model` describes a shape. An `api` stores it and serves it over REST:

```art
model Book {
  id: ID
  title: String min=1 max=120
  author: String?
  read: Bool = false
}

api books: Book
```

That line gives you `/api/books` with list, get, create, update and remove, validated against the model on the server (the title must have 1 to 120 characters) and stored in SQLite. `author` is optional (`String?`), and `read` defaults to `false`, so `create` may leave it out.

## 2. A page that lists them

```art
page Books "/" {
  data books = api.books.list({ sort: "title" })
  state title = ""

  fn add() {
    await api.books.create({ title, author: null })
    title = ""
  }

  column gap=4 pad=6 {
    title "Reading list"
    row gap=2 {
      input title placeholder="Book title" -> add()
      button "Add" primary -> add()
    }
    for b in books key b.id {
      row gap=2 {
        checkbox b.read -> api.books.update(b.id, { read: b.read })
        text b.title muted=b.read
        button "Remove" small danger -> api.books.remove(b.id)
      }
    }
  }
}
```

- `data books = api.books.list(...)` loads when the page mounts and **reloads by itself after every write**: after `create`, `update` or `remove` the list is fresh without any code.
- `api.books.create({ ... })` is typed: a missing field or a wrong type is a compile error.
- `checkbox b.read` binds the checkbox to the row's field; its `->` runs on change.
- `text b.title muted=b.read` turns a flag on and off with a condition.
- `key b.id` keeps each row's DOM when the list changes.

## 3. Loading and errors

`data` has `loading` and `error`:

```art
if books.loading {
  spinner
} else {
  if books.length == 0 {
    text "Nothing yet. What do you want to read?" muted
  }
}
```

A failed write throws; catch it to show the server's validation message:

```art
state problem = ""

fn add() {
  try {
    await api.books.create({ title, author: null })
    title = ""
    problem = ""
  } catch (e) {
    problem = e.message
  }
}
```

## 4. Filtering

Queries take `where`, `search`, `sort`, `limit` and `offset`. Inside `data` they re-run when a state they use changes:

```art
state show = "All"
state q = ""
data books = api.books.list({ search: q, where: show == "To read" ? { read: false } : {}, sort: "title" })
```

```art
row gap=2 {
  tabs show options=["All", "To read"]
  input q placeholder="Search"
}
```

## 5. Accounts and private lists

Add a users model with `email` and `password`, declare `auth`, and make the books `private`: each user only sees and changes their own rows. A private model needs an `owner: ID` field, which the server fills in.

```art
model User {
  id: ID
  email: Email unique
  password: String min=8
}

api users: User

auth users

model Book {
  id: ID
  owner: ID
  title: String min=1 max=120
  author: String?
  read: Bool = false
}

api books: Book private
```

Passwords are hashed with scrypt and never returned. Sessions are `HttpOnly` cookies.

## 6. Sign-in page and a guard

```art
page Login "/login" {
  state email = ""
  state password = ""
  state problem = ""

  fn submit() {
    try {
      await auth.login(email, password)
      navigate("/")
    } catch (e) {
      problem = e.message
    }
  }
  fn join() {
    try {
      await auth.signup({ email, password })
      navigate("/")
    } catch (e) {
      problem = e.message
    }
  }

  form gap=3 pad=6 -> submit() {
    title "Sign in"
    input email label="Email" type=email
    input password label="Password" type=password
    if problem != "" {
      text problem danger
    }
    row gap=2 {
      button "Sign in" primary
      button "Create account" -> join()
    }
  }
}
```

Protect the list with `requires login`: visitors without a session go to `/login`.

```art
page Books "/" requires login {
  data books = api.books.list({ sort: "title" })
  // the rest of the page, as before
}
```

`auth.me()` is `User?`: the compiler makes you handle `null` (`me?.email`, or `if me { }`).

## 7. A layout

A layout wraps every page and stays mounted while they change:

```art
layout Main {
  data me = auth.me()

  column gap=0 {
    row justify=between pad=4 {
      link "Reading list" to="/"
      if me {
        row gap=2 {
          text me.email muted small
          button "Sign out" small -> auth.logout()
        }
      }
    }
    slot
  }
}
```

## 8. Tests

Tests describe what a person does and sees. `art test` runs them in a simulated browser with a fresh database:

```art
test "adds a book after signing up" {
  open "/login"
  fill "Email" "ana@example.com"
  fill "Password" "12345678"
  click "Create account"
  see "Sign out"
  fill "Book title" "Dune"
  click "Add"
  see "Dune"
}
```

```sh
npx art test
```

## 9. Ship it

```sh
npm run build
cd dist && node server.js
```

`dist/server.js` is one file with the app, the api and the database (SQLite in `dist/data/`). There's a `Dockerfile` next to it; [Deploying](/learn/deploy) covers Fly.io, Railway, Render and plain servers.

## What you used

`model`, `api` with `private`, `auth`, `data` with queries, `state`, `fn` with `await` and `try`, `page` with a route and `requires login`, `layout`, `form`, bound inputs, `for ... key`, conditional flags and `test`. That's most of the language; the rest is in the guides and the [spec](docs/SPEC.md).
