# ArtScript v0.1 — Spec para IA

Lenguaje web que compila a JavaScript. Archivos `.art`. Expresiones = JavaScript. Solo la estructura es nueva.

## Declaraciones (nivel superior)

```
model User {
  id: ID
  name: String
  bio: String?
  tags: String[]
}

component UserCard(user: User, onDelete: Fn, big: Bool = false) {
  ...miembros y vista
}

page Users "/users" {
  ...miembros y vista
}
```

- Tipos: `String Number Bool ID Email Date Fn Any`, nombres de `model`, `T[]` lista, `T?` opcional (puede ser null).
- `page` = componente con ruta (hash routing: `#/users`). Sin ruta: `/nombre-en-minúsculas`. Ruta desconocida → primera página.

## Miembros (dentro de component/page, antes de la vista)

```
state count = 0                  // reactivo; tipo inferido
state users: User[] = []         // tipo explícito
computed total = count * 2       // derivado, solo lectura
fn add(x) {                      // función; cuerpo = sentencias JS
  if x == "" { return }
  users.push({ id: crypto.randomUUID(), name: x, tags: [] })
}
```

- Asignar a un `state` actualiza la UI: `count++`, `name = "x"`, `users.push(u)`, `user.name = "x"`.
- No hay hooks, setters ni dependencias manuales.
- Sentencias: expresión, `let x = ...`, `if cond { } else { }`, `return`.

## Vista

Una línea por elemento: `tag contenido prop=valor flag -> acción { hijos }`

```
column gap=4 align=center {
  title "Usuarios"
  text `Total: ${total}` muted
  input draft placeholder="Nombre" -> add(draft)
  button "Agregar" primary -> add(draft)
  if users.length == 0 {
    text "Vacío"
  } else {
    for u, i in users {
      UserCard user=u onDelete=(id => users = users.filter(x => x.id != id))
    }
  }
}
```

| Elemento | Contenido | `->` se dispara en | Props | Flags |
|---|---|---|---|---|
| `text` | texto | — | | bold muted small large |
| `title` | texto | — | | muted small large |
| `button` | texto | click | disabled | primary danger small |
| `input` | **state a enlazar** (bidireccional) | Enter | placeholder type disabled | |
| `image` | src | — | alt width height | |
| `link` | texto | — | to href | muted |
| `row` `column` `card` | — | — | gap pad align justify | row: wrap |
| `grid` | — | — | gap pad align justify cols | |
| `form` | — | submit | gap pad align justify | |

- Todos aceptan `class style id`.
- Flag condicional: `text t.title muted=t.done` aplica el flag mientras el valor sea `true`.
- `gap=4` y `pad=4`: 1 unidad = 4px. `align=start|center|end|stretch`. `justify=start|center|end|between|around`. `cols=3`.
- `type=text|number|email|password|checkbox|date`. Con `type=checkbox`, `input` enlaza un Bool.
- Valores de prop: literal, nombre, `a.b`, llamada o `( expresión )` entre paréntesis.
- Componente: `Nombre prop=valor`. Nombre en mayúscula.
- Si un componente recibe un modelo como prop y modifica un campo (`todo.done = true`), el state dueño se actualiza solo.
- Acción de varias sentencias: `-> { a(); b = 1 }`.

## Expresiones

JavaScript: literales, `` `template ${x}` ``, `a.b`, `a?.b`, `a[i]`, `f(x)`, `x => x * 2`, `{ a, ...b }`, `[...xs]`, `? :`, `??`, `&&`, `||`.
`==` y `!=` compilan a `===` y `!==`. Una línea que empieza con `?`, `:`, `.`, `&&`, `||` o `??` continúa la expresión anterior (ternarios y cadenas en varias líneas). Globales JS disponibles: `Math JSON Date crypto fetch console localStorage`, etc.

## Reglas que el compilador verifica

- `lista[i]` es `T?`: usar `lista[i]?.campo` o `?? valor`.
- Objetos pasados a un `model` deben tener todos sus campos no opcionales y ningún campo extra.
- No se puede asignar a `computed` ni a props directamente.
- Nombres, elementos, props y flags desconocidos → error con sugerencia.

## Herramientas

```
art check --ai        errores como JSON: {"code","type","loc","expr","expected","actual","fixes"}
art context [Nombre]  contexto compacto de un componente (o mapa del proyecto)
art fmt --write       formato canónico
art build | art dev   compilar | servidor con recarga
```
