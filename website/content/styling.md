# Styling and themes

ArtScript apps look finished without any CSS: elements have a clean default theme with dark mode. When you want your own look, there are four levels, from least to most code.

## 1. Layout props

`row`, `column`, `grid`, `card`, `form` and `modal` take layout props. Spacing is in units of 4px:

```art
column gap=4 pad=6 align=center {
  row gap=2 justify=between wrap {
    text "Left"
    text "Right"
  }
  grid cols=3 gap=4 {
    card pad=4 {
      text "One"
    }
  }
}
```

- `gap` and `pad`: spacing (`gap=4` is 16px).
- `align`: `start center end stretch`. `justify`: `start center end between around`.
- `grid cols=3`: equal columns. `row wrap`: wrap onto new lines.

## 2. Responsive props

Prefix `cols`, `gap` or `pad` with a breakpoint (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px). It applies from that width up:

```art
grid cols=1 md:cols=2 lg:cols=4 gap=3 lg:gap=6 {
  card pad=4 {
    text "Responsive"
  }
}
```

## 3. The theme

Any `.css` file in the project is bundled into `app.css`, after the defaults. Set the theme variables in `:root`:

```css
:root {
  --a-primary: #e11d48;
  --a-radius: 4px;
  --a-font: "Inter", system-ui, sans-serif;
  --a-bg: #ffffff;
  --a-fg: #111111;
  --a-surface: #ffffff;
  --a-border: #e5e5e5;
  --a-muted: #737373;
  --a-danger: #dc2626;
  --a-success: #16a34a;
}
```

Every element takes `class`, `style` and `id`, so regular CSS works too: `card class="hero"`, `text t.name style="letter-spacing: 1px"`. Both may be expressions: `class=(active ? "tab on" : "tab")`.

## 4. Scoped styles

A `style { }` block inside a component applies only to that component's elements:

```art
component PriceTag(price: Number) {
  style {
    .tag { font-weight: 700; color: var(--a-primary); }
    .tag:hover { text-decoration: underline; }
  }

  text `$${price}` class="tag"
}
```

The compiler rewrites the selectors so they can't leak into other components.

## Dark mode

Apps follow the system's light or dark setting. To let people choose:

```art
button (theme() == "dark" ? "Light mode" : "Dark mode") -> setTheme(theme() == "dark" ? "light" : "dark")
```

`setTheme("dark" | "light" | "auto")` changes it and remembers it; `theme()` reads it and updates the view when it changes. For your own CSS, match both cases the same way the defaults do:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --brand: #a78bfa; }
}
:root[data-theme="dark"] { --brand: #a78bfa; }
```

## Icons

`icon` draws a [Lucide](https://lucide.dev) icon. Only the icons you use are included in the app:

```art
row gap=2 {
  icon "search" muted
  icon "trash" size=16 danger label="Delete"
}
```

The name must be written as text (the compiler bundles it); use `if` to switch between icons.

## Ready-made components

`art add` copies official components into your project as source you own and can change:

```sh
npx art add DataTable Pagination ConfirmButton SearchBox Stat EmptyState
```
