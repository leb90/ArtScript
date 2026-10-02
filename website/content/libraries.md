# JavaScript libraries

ArtScript covers the UI, the data and the server. For anything else (dates, charts, maps, payments, markdown, your own algorithms) there's the whole JavaScript ecosystem, through `use`.

## `use`

```art
use "date-fns" { format, addDays }
use "canvas-confetti" as confetti
use "./lib/money.ts" { toUSD }
```

- `{ a, b }` imports named exports; `as name` imports the default export.
- Packages come from your project's `node_modules`: install them with `npm install` first.
- Local paths are relative to the `.art` file. TypeScript works as is.
- Imported names are available in every component and server function of the project, typed `Any`.

The compiler checks that the module exists and that it exports every name you import, so a typo is an error at compile time with the list of real exports. `art build` bundles everything into one minified file; only what you use is included.

## Your own TypeScript

The way out for anything the language doesn't have is a plain module:

```ts
// src/lib/money.ts
export const toUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
```

```art
use "./lib/money.ts" { toUSD }

component Price(cents: Number) {
  text toUSD(cents) bold
}
```

This website does the same: its pages are ArtScript, and two small TypeScript modules render the repository's Markdown and run the compiler in the playground.

## DOM libraries: charts, maps, editors

Libraries that draw into an element get it through `ref`, start in `mount` and stop in `cleanup`:

```art
use "chart.js/auto" as Chart

component SalesChart(values: Number[]) {
  ref box

  mount {
    let chart = new Chart(box, { type: "bar", data: { labels: values.map((_, i) => `Week ${i + 1}`), datasets: [{ label: "Sales", data: values }] } })
    cleanup {
      chart.destroy()
    }
  }
  column ref=box
}
```

`effect` re-runs when the states it reads change, to push new data into the library. You can also set properties of a ref directly: `box.innerHTML = html`, `box.scrollTop = 0`.

## On the server

A `server fn` can use packages too, including Node-only ones (`stripe`, `pg`, `sharp`). `art build` bundles them into `dist/server.js`, which still runs without `node_modules`.

```art
use "stripe" as Stripe

server fn checkout(priceId) {
  let stripe = new Stripe(process.env.STRIPE_KEY)
  let session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price: priceId, quantity: 1 }], success_url: "https://example.com/thanks" })
  return session.url
}
```
