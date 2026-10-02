# Recipes

Short, complete answers to things most apps need. Each one is a whole program: paste it into `src/app.art` and run `npm run dev`. All of them are compiled by the test suite, so they stay correct.

## A form with validation

The server checks every write against the model's rules; the form shows its message.

```art
model Signup {
  id: ID
  name: String min=2 max=40
  email: Email unique
  age: Number min=18
}

api signups: Signup

page Join "/" {
  state name = ""
  state email = ""
  state age = 18
  state problem = ""
  state done = false

  fn submit() {
    try {
      await api.signups.create({ name, email, age })
      done = true
      problem = ""
    } catch (e) {
      problem = e.message
    }
  }

  if done {
    text "Thanks, you're in." success
  } else {
    form gap=3 -> submit() {
      input name label="Name" required
      input email label="Email" type=email required
      input age label="Age" type=number
      if problem != "" {
        text problem danger
      }
      button "Join" primary
    }
  }
}
```

`input age type=number` binds a `Number`. The error message comes from the server (`name must have at least 2 characters`, `email is already used`), so the rules live in one place.

## Search, sort and pagination

`data` re-runs its query when a state it uses changes.

```art
model Product {
  id: ID
  name: String
  price: Number
}

api products: Product

page Products "/" {
  state q = ""
  state sort = "name"
  state page = 0
  data items = api.products.list({ search: q, sort, limit: 10, offset: page * 10 })
  data total = api.products.count({ search: q })
  computed pages = Math.max(1, Math.ceil(total / 10))

  column gap=3 {
    row gap=2 {
      input q placeholder="Search" on:input=(page = 0)
      select sort options=[{ value: "name", label: "Name" }, { value: "-price", label: "Most expensive" }, { value: "price", label: "Cheapest" }]
    }
    table {
      tr {
        th "Name"
        th "Price"
      }
      for p in items key p.id {
        tr {
          td p.name
          td `$${p.price}`
        }
      }
    }
    row gap=2 align=center {
      button "Previous" small disabled=(page == 0) -> page--
      text `Page ${page + 1} of ${pages}` muted
      button "Next" small disabled=(page + 1 >= pages) -> page++
    }
  }
}
```

## Confirm before deleting

```art
model Note {
  id: ID
  text: String
}

api notes: Note

page Notes "/" {
  data notes = api.notes.list()
  state asking = false
  state target: Note? = null

  fn ask(n) {
    target = n
    asking = true
  }
  fn confirm() {
    if target {
      await api.notes.remove(target.id)
    }
    asking = false
    notify("Deleted", "success")
  }

  column gap=2 {
    for n in notes key n.id {
      row gap=2 {
        text n.text
        button "Delete" small danger -> ask(n)
      }
    }
  }
  modal asking gap=3 {
    title "Delete this note?" small
    text target?.text ?? "" muted
    row gap=2 justify=end {
      button "Cancel" -> asking = false
      button "Delete" danger -> confirm()
    }
  }
}
```

`modal asking` opens while `asking` is true; Esc and the backdrop close it. For a ready-made version, `npx art add ConfirmButton`.

## Upload an image with a preview

```art
model Profile {
  id: ID
  name: String
  photo: File? max=2000000 accept="image/*"
}

api profiles: Profile

page Profiles "/" {
  data profiles = api.profiles.list()
  state name = ""
  state photo: File? = null
  computed preview = photo ? URL.createObjectURL(photo) : ""

  fn save() {
    await api.profiles.create({ name, photo })
    name = ""
    photo = null
  }

  column gap=3 {
    form gap=2 -> save() {
      input name label="Name"
      file photo accept="image/*" label="Photo"
      if preview != "" {
        image preview width=120 alt="Preview"
      }
      button "Save" primary
    }
    grid cols=2 md:cols=4 gap=3 {
      for p in profiles key p.id {
        card gap=2 {
          if p.photo {
            image p.photo.url alt=p.name
          }
          text p.name bold
        }
      }
    }
  }
}
```

## Remember a setting in the browser

```art
page Settings "/" {
  state compact = localStorage.getItem("compact") == "yes"

  effect {
    localStorage.setItem("compact", compact ? "yes" : "no")
  }
  checkbox compact label="Compact view"
  text compact ? "Compact" : "Comfortable" muted
}
```

`effect` re-runs whenever `compact` changes. For the theme, `setTheme` already remembers the choice.

## Tabs that live in the URL

```art
page Account "/account" {
  state tab = query.tab ?? "Profile"

  effect {
    history.replaceState(null, "", `?tab=${tab}`)
  }
  tabs tab options=["Profile", "Billing", "Security"]
  if tab == "Profile" {
    text "Your profile"
  } else if tab == "Billing" {
    text "Your plan and invoices"
  } else {
    text "Password and sessions"
  }
}
```

Reloading or sharing the link keeps the tab.

## Live data: a tiny chat

```art
model User {
  id: ID
  email: Email unique
  password: String min=8
  name: String
}

api users: User

auth users

model Message {
  id: ID
  author: User
  text: String min=1 max=500
  sent: Number
}

api messages: Message login

page Chat "/" requires login {
  data me = auth.me()
  data messages = api.messages.list({ sort: "sent", limit: 100 }) live
  state draft = ""

  fn send() {
    if me {
      await api.messages.create({ author: me, text: draft, sent: Date.now() })
      draft = ""
    }
  }

  column gap=2 {
    for m in messages key m.id {
      row gap=2 {
        text m.author.name bold
        text m.text
      }
    }
    input draft placeholder="Message" -> send()
  }
}
```

`live` reloads the list when anyone writes to it, over a single server-sent events connection.

## Call an external API with a secret

Secrets stay on the server: read them in a `server fn` from the environment.

```art
server fn weather(city) {
  let key = process.env.WEATHER_KEY ?? ""
  if key == "" {
    fail("WEATHER_KEY is not set", 500)
  }
  let res = await fetch(`https://api.example.com/weather?q=${encodeURIComponent(city)}&key=${key}`)
  if !res.ok {
    fail("The weather service didn't answer", 502)
  }
  let body = await res.json()
  return { city, temp: body.temp }
}

page Weather "/" {
  state city = "Buenos Aires"
  data report = server.weather(city)

  input city placeholder="City"
  if report {
    text `${report.temp}° in ${report.city}`
  } else {
    spinner
  }
}
```

## A chart

Charting libraries draw into an element: `ref` hands it over, `mount` starts the chart and `cleanup` stops it.

```art
use "chart.js/auto" as Chart

page Sales "/" {
  state values = [12, 19, 7, 15, 22]
  ref canvas

  mount {
    let chart = new Chart(canvas, { type: "bar", data: { labels: values.map((_, i) => `Week ${i + 1}`), datasets: [{ label: "Sales", data: values }] } })
    cleanup {
      chart.destroy()
    }
  }
  column ref=canvas style="max-width: 640px"
}
```

Install it first: `npm install chart.js`.

## Format dates and money

```art
use "./lib/format.ts" { day, money }

page Invoice "/" {
  state issued = Date.now()
  state total = 1234.5

  text `Issued ${day(issued)}` muted
  text money(total) bold large
}
```

```ts
// src/lib/format.ts
export const day = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(ms);
export const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
```

## An admin area

```art
model User {
  id: ID
  email: Email unique
  password: String min=8
  role: String
}

api users: User

auth users

model Post {
  id: ID
  title: String
  published: Bool = false
}

api posts: Post admin

page Blog "/" {
  data posts = api.posts.list({ where: { published: true } })

  for p in posts key p.id {
    text p.title
  }
}

page Admin "/admin" requires admin {
  data posts = api.posts.list()
  state title = ""

  input title placeholder="New post" -> api.posts.create({ title })
  for p in posts key p.id {
    checkbox p.published label=p.title -> api.posts.update(p.id, { published: p.published })
  }
}
```

The first account is the admin. `admin` on the api protects the data; `requires admin` keeps the page from showing to anyone else.

## A nightly cleanup

```art
model Draft {
  id: ID
  text: String
  updated: Number
}

api drafts: Draft

server job cleanup every "1d" {
  let monthAgo = Date.now() - 30 * 24 * 3600 * 1000
  db.drafts.list().filter(d => d.updated < monthAgo).forEach(d => db.drafts.remove(d.id))
}
```

Jobs don't overlap: if a run takes longer than the interval, the next one waits.
