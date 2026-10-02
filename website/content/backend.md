# Data and backend

The backend lives in the same `.art` files as the UI. `art dev` runs it next to the app, and `art build` bundles it into one Node file.

## Models

A `model` is a typed shape. Field types: `String Number Bool ID Email Date File Any`, other models, lists (`T[]`) and optional values (`T?`).

```art
model Product {
  id: ID
  name: String min=2 max=80
  sku: String match="^[A-Z]{3}-[0-9]{4}$" unique
  price: Number min=0
  stock: Number = 0
  tags: String[]
  photo: File? max=2000000 accept="image/*"
}
```

- **Rules** run on the server for every write: `min` and `max` (length for text, value for numbers, size for lists), `match` (a regular expression), `unique`.
- **Defaults** (`= 0`) let `create` leave the field out.
- **Changing a model needs no migrations.** A new required field needs a default (or `?`); a renamed one keeps its data with `was="oldName"`. Every schema change makes a backup of the database first.

## Apis

```art
api products: Product
```

One line serves `/api/products` with list, get, create, update and remove, validates every write against the model and stores the rows in SQLite (built into Node). The model needs an `ID` field; if `create` leaves it out, the server assigns one.

From any component, the typed client:

```art
api.products.list(query)
api.products.count(query)
api.products.get(id)
api.products.create({ name, sku, price, tags: [] })
api.products.update(id, { price: 10 })
api.products.remove(id)
```

`create` is checked against the model at compile time: a missing field, an extra one or a wrong type is an error before anything runs.

## Loading data

`data` loads when the component mounts and **reloads by itself after any write**, login or logout:

```art
data products = api.products.list({ sort: "-price", limit: 20 })
data total = api.products.count()
data product = api.products.get(params.id)
```

A list starts as `[]`, a count as `0` and `get` as `null`. Each has `.loading` (until the first answer), `.error` (a message or `null`) and `.reload()`. Add `live` to also reload when someone else changes the data:

```art
data messages = api.messages.list({ sort: "-sent" }) live
```

## Queries

```art
state search = ""
state page = 0

data products = api.products.list({ where: { active: true }, search, sort: "-price", limit: 20, offset: page * 20 })
data total = api.products.count({ where: { active: true }, search })
```

- `where` matches fields exactly.
- `search` matches the text fields.
- `sort` is a field, `-field` for descending.
- `limit` and `offset` page through the results.

Inside `data`, the query re-runs when a state it uses changes: typing in a search box or going to the next page just works.

## Relations

A field typed as another stored model keeps that row's id, and reads back as the row:

```art
model Author {
  id: ID
  name: String
}

model Post {
  id: ID
  title: String
  author: Author
  tags: Tag[]
}

model Tag {
  id: ID
  label: String
}

model Comment {
  id: ID
  post: Post cascade
  text: String
}

api authors: Author

api posts: Post

api tags: Tag

api comments: Comment
```

- Writes take the row or its id: `create({ title, author: me, tags: [] })`.
- Reads return the row: `post.author.name`. Deeper levels are opt-in: `api.comments.list({ include: ["post.author"] })`.
- `where: { author: id }` filters by the related row.
- Deleting a row that others point to fails with a clear message, unless the field is `cascade`, which deletes them too.

## Files

A `File` field takes the `File` from a `file` input. It's uploaded, checked against `max` and `accept`, and stored as `{ url, name, type, size }`:

```art
page NewProduct "/products/new" {
  state name = ""
  state photo: File? = null

  form gap=3 -> api.products.create({ name, sku: "ABC-0001", price: 1, tags: [], photo }) {
    input name label="Name"
    file photo accept="image/*" label="Photo"
    button "Save" primary
  }
}
```

Uploads go to the data directory, or to S3 and compatible stores (Cloudflare R2, MinIO) with the `ART_S3_*` variables.

## Server functions

Logic that must run on the server goes in a `server fn`. Call it as `server.name(...)`, also inside `data`:

```art
server fn restock(id, amount) {
  if !me {
    fail("Sign in first", 401)
  }
  let p = db.products.get(id)
  if !p {
    fail("No such product", 404)
  }
  db.products.update(id, { stock: p.stock + amount })
  return db.products.get(id)
}
```

Inside: `db.<api>` (synchronous, not scoped to the user), `me` (the signed-in user or `null`), `fail(message, status)` and `await email(to, subject, text)`.

## Jobs

```art
server job lowStock every "1d" {
  let empty = db.products.list().filter(p => p.stock == 0)
  if empty.length > 0 {
    await email("owner@example.com", "Out of stock", empty.map(p => p.name).join(", "))
  }
}
```

Intervals are `s`, `m`, `h` or `d`. Jobs have `db`, `fail` and `email`.

## Where the data lives

In development, in `.art/data/` inside your project (ignored by git). In production, in `dist/data/` (or `ART_DATA_DIR`): `art.db` is the SQLite database and `files/` the uploads. See [Deploying](/learn/deploy) for backups and volumes.
