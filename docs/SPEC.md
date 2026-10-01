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
- Sentencias: expresión, `let x = ...`, `if cond { } else { }`, `return`, `try { } catch (e) { }`.

## Backend: `api` y `data`

```
api users: User                    // REST en /api/users: validado con el model, datos guardados
```

- El model necesita un campo `ID` (si falta en `create`, lo asigna el servidor).
- Cliente tipado en cualquier componente: `api.users.list()`, `get(id)`, `create(obj)`, `update(id, cambios)`, `remove(id)`.
- `data users = api.users.list()` carga al montar y **se recarga sola** después de cualquier `create`/`update`/`remove` de esa api. Una lista empieza como `[]`; `get` empieza en `null` (`T?`).
- `await` y `try { } catch (e) { }` funcionan como en JS; `e.message` explica el error de validación.
- Acceso: `api notes: Note login` exige sesión; `api notes: Note private` además separa por usuario (el model necesita `owner: ID`, que se completa solo).
- `auth users` (el model necesita `email: Email` y `password: String`): `auth.signup(obj)`, `auth.login(email, password)`, `auth.logout()`, `data me = auth.me()` (`T?`). La contraseña se guarda hasheada y nunca se devuelve.
- `server fn nombre(a, b) { ... }` corre en el servidor; se llama como `server.nombre(a, b)` (también en `data`). Adentro: `db.<api>` (sin `await`, sin filtro por usuario), `me` (usuario logueado o `null`) y `fail("mensaje", status?)`.
- Después de cualquier escritura, login o logout, todos los `data` se recargan.
- `art dev` sirve la api; `art build` genera `dist/server.js` (`node dist/server.js`).

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
- Dentro de `if x { }`, `if x != null`, `x && ...`, `x ? ... : ...` o después de `if !x { return }`, `x` ya no es null.
- Objetos pasados a un `model` deben tener todos sus campos no opcionales y ningún campo extra.
- No se puede asignar a `computed` ni a props directamente.
- Nombres, elementos, props y flags desconocidos → error con sugerencia.

## Modificar código existente: `art patch`

Para cambiar código que ya existe, respondé con un bloque ```` ```patch ```` en vez de reescribir archivos:

```patch
replace Todos/column/title
  title "Mis tareas"
insert after Todos/column/row
  text "Escribí y presioná Enter" muted
append Todos
  fn clearDone() {
    todos = todos.filter(t => !t.done)
  }
set Todos/column gap=6 -align
remove Todos/column/if/else/text
```

- Operaciones: `replace`, `insert before`, `insert after`, `append` (hijos de un nodo, o miembros/vista de un componente, o campos de un model), `remove`, `set` (props en la misma línea; `-nombre` quita), `add [archivo.art]` (declaraciones nuevas).
- Rutas: `Componente/tag/tag[n]` (n = índice desde 0 entre hermanos con el mismo tag; también `if`, `for`, `if/else`), `Componente.miembro`, `Modelo.campo`. `art context Componente` lista las rutas.
- Se aplica en orden y es atómico: si algo falla, no cambia nada.

## Herramientas

```
art check --ai        errores como JSON: {"code","type","loc","expr","expected","actual","fixes"}
art context [Nombre]  contexto compacto de un componente (o mapa del proyecto)
art fmt --write       formato canónico
art build | art dev   compilar | servidor con recarga
```
