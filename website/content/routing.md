# Pages and routing

A `page` is a component with a URL. Pages change without reloading (History API), and `art build --prerender` turns each static one into a real HTML file.

```art
page Home "/" {
  title "Welcome"
  link "See the products" to="/products"
}

page Products "/products" {
  title "Products"
}
```

Without a route, a page is served at its lowercase name: `page About` is `/about`.

## Params and the query string

`:name` in the route is a param, read as `params.name` (a `String`). `query` holds the query string:

```art
page Product "/products/:id" {
  data product = api.products.get(params.id)
  state tab = query.tab ?? "details"

  if product {
    title product.name
    tabs tab options=["details", "reviews"]
  }
}
```

`/products/42?tab=reviews` gives `params.id == "42"` and `query.tab == "reviews"`.

## Not found

`*` catches every path that no other page matches:

```art
page NotFound "*" {
  title "Page not found"
  link "Go home" to="/"
}
```

## Navigation

`link "Text" to="/path"` is a real `<a>` (it works with the middle button and "open in new tab") that navigates without reloading. From code, call `navigate`:

```art
fn saved(id) {
  notify("Saved", "success")
  navigate(`/products/${id}`)
}
```

`href="https://..."` links to other sites. `notify(message, kind)` shows a short message (`info`, `success`, `danger`).

## Layouts

A `layout` wraps pages and **stays mounted** while they change: its state, its scroll and its `data` survive navigation. It puts the page where it writes `slot`.

```art
layout Main {
  column gap=0 {
    row gap=4 pad=4 {
      link "Home" to="/"
      link "Products" to="/products"
    }
    slot
  }
}
```

When there's only one top-level layout, every page uses it. With several, a page picks one: `page Admin "/admin" layout Dashboard`.

### Layouts inside layouts

A layout can render inside another one. Here every page has the site header, and the docs pages also have a sidebar:

```art
layout Site {
  column gap=0 {
    row gap=4 pad=4 {
      link "Home" to="/"
      link "Docs" to="/docs"
    }
    slot
  }
}

layout Docs layout Site {
  row gap=6 align=start {
    column gap=1 class="sidebar" {
      link "Introduction" to="/docs"
      link "Install" to="/docs/install"
    }
    slot
  }
}

page Intro "/docs" layout Docs {
  title "Introduction"
}

page Install "/docs/install" layout Docs {
  title "Install"
}
```

Going from one docs page to another keeps both layouts mounted (the sidebar keeps its scroll and state); going home removes `Docs` and keeps `Site`.

Links to the current page get `aria-current="page"`, so the active item of a menu is one CSS rule:

```css
.sidebar a[aria-current="page"] { font-weight: 600; }
```

## Titles and meta tags

`meta` sets the page's title, description and Open Graph image:

```art
page Pricing "/pricing" {
  meta title="Pricing · Acme" description="Plans for teams of every size." image="/og/pricing.png"
  title "Pricing"
}
```

It also takes `imageAlt=` (what the shared preview shows to screen readers), `siteName=`, `locale="es_ES"`, `themeColor=` and `lang="es"`: the page's language, written on `<html lang>` in the prerendered page and set again as the visitor moves between pages; when a layout sets it, it is the default of every page. A prerendered page also gets the image's width and height (`og:image:width`, read from the file in `public/`).

`jsonld=` writes structured data for search engines, built from the app's own data so it can't drift from what the page shows:

```art
const PRODUCTS = [
  { name: "Chipa", price: 3 },
  { name: "Mate", price: 5 },
]

page Home "/" {
  meta title="Chipa Club" lang="es" jsonld=({ "@context": "https://schema.org", "@type": "Store", name: "Chipa Club", makesOffer: PRODUCTS.map(p => ({ "@type": "Offer", name: p.name, price: p.price })) })
  title "Chipa Club"
}
```

For tags no prop covers (a search engine's verification tag, a font preload), put them in `head.html` at the project root: it goes into every page's `<head>` as written.

## Guards

`requires login` shows a page only to signed-in users; `requires admin` only to admins. Others are sent to `/login` (when the app has that page) or to `/`.

```art
page Account "/account" requires login {
  data me = auth.me()
  text me?.email ?? ""
}

page Admin "/admin" requires admin {
  title "Admin"
}
```

Guards keep a page from showing. The data is protected by the api itself (`login`, `private`, `admin`): see [Accounts and access](/learn/auth).

## Server rendering

An app with an `api` is served by `dist/server.js`, which renders every page on the server for each request: the HTML arrives with the page's `data` already loaded, its title and meta tags, and as the visitor (their session decides what `auth.me()` and `private` apis return). Search engines and AI crawlers read real content on every page, including `/products/:id`, and people see it before the JavaScript loads.

The responses the page was rendered with go in the HTML, so the browser doesn't ask for them again. A `requires login` page answers with a redirect to `/login` right from the server. Nothing changes in your code; `ART_SSR=off` turns it off.

## Prerendering and SEO

```sh
art build --prerender --site https://example.com
```

Every page without params becomes an HTML file with its content, title and meta tags, readable by search engines and AI crawlers without JavaScript. `--site https://example.com` also writes `sitemap.xml` (with the date of the build) and `robots.txt`, and gives every page its canonical address, `og:url`, `og:type` and a `twitter:card`; addresses end in `/`, the form static hosts serve without a redirect. Pages with params (`/products/:id`) are served an empty shell (`_app.html`) that the app fills in.

To serve the app under a subpath (a GitHub Pages project site, or a proxy prefix), add `--base /docs`: links, `navigate` and asset URLs get the prefix, and your code keeps writing `/products`. A GitHub Pages project site is served under its repository name: `--base /my-repo`.
