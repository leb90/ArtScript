# JavaScript libraries

ArtScript covers the UI, the data and the server. For anything else (dates, charts, maps, payments, markdown, your own algorithms) there's the whole JavaScript ecosystem, through `use`.

## `use`

```art
use "date-fns" { format, addDays }
use "canvas-confetti" as confetti
use "./sim.ts" { step, draw }
```

- `{ a, b }` imports named exports (`{ a as b }` renames one); `as name` imports the default export.
- Packages come from your project's `node_modules`: install them with `npm install` first.
- Local paths are relative to the `.art` file. TypeScript works as is.
- Imported names are available in every component and server function of the project, typed `Any`.

The compiler checks that the module exists and that it exports every name you import, so a typo is an error at compile time with the list of real exports. `art build` bundles everything into one minified file; only what you use is included.

## Data, constants and helpers: in `.art`

Mock data, constants, caches and formatters are ArtScript, written at the top level of any `.art` file and shared by every component. The checker verifies them; what a `.ts` module exports arrives as `Any`.

```art
use "date-fns" { formatDistanceToNow }

const TAX = 0.21
const PEOPLE = [
  { name: "Ana", city: "Lima", joined: "2024-03-01" },
  { name: "Bea", city: "Quito", joined: "2025-07-15" }
]
const avatars = new Map()

fn money(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

fn since(iso) {
  return formatDistanceToNow(new Date(iso))
}

component Person(name: String, joined: String) {
  text `${name}, member for ${since(joined)}`
}
```

## When a `.ts` file earns its place

Code that drives the DOM imperatively or runs every frame: an animation loop, canvas or WebGL drawing, a parser, or the wrapper of a library that owns its element (a map, a chart). There it's plain TypeScript with no restrictions:

```ts
// src/sim.ts
export function step(balls: Ball[], dt: number) { /* physics */ }
export function draw(ctx: CanvasRenderingContext2D, balls: Ball[]) { /* canvas */ }
```

```art
use "./sim.ts" { step, draw }

page Sim "/" {
  ref canvas
  state balls = []

  mount {
    let ctx = canvas.getContext("2d")
    let frame = 0
    let tick = () => {
      step(balls, 1 / 60)
      draw(ctx, balls)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    cleanup {
      cancelAnimationFrame(frame)
    }
  }
  canvas ref=canvas width=400 height=300
}
```

`art check` warns (`MODULE_COULD_BE_ART`) when a local module only holds data and functions, with the fix. This website follows the same split: its pages are ArtScript, and TypeScript modules render the repository's Markdown and run the compiler in the playground.

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
