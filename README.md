# ArtScript

Lenguaje web AI-native que compila a JavaScript. Objetivo: que una IA construya y modifique apps web gastando **menos dinero** (menos tokens, menos contexto, menos reintentos) que con React/TypeScript.

```
page Counter "/" {
  state count = 0
  computed double = count * 2

  row gap=2 {
    button "-" -> count--
    text count bold
    button "+" primary -> count++
  }
  text `El doble es ${double}` muted
}
```

Estado: **v0.1, MVP base**. Ver [ARTSCRIPT_VIABILIDAD.md](ARTSCRIPT_VIABILIDAD.md) para la visión, los riesgos y la hoja de ruta.

## Uso

Requiere Node 24+.

```sh
npm install
npm run dev            # ejemplo todo en http://localhost:3000 (se recarga al guardar)
npm run dev:counter    # ejemplo contador
npm test               # tests
npm run typecheck      # tipos del compilador
npm run bench          # tokens y bytes vs React/Svelte
```

Crear un proyecto nuevo (queda con `npm run dev`, `npm run build` y `npm run check`):

```sh
node src/cli.ts init mi-app
cd mi-app && npm install && npm run dev
```

Otros comandos: `npm run art -- <comando>` (por ejemplo `npm run art -- check examples/todo --ai`). Lista completa: `npm run art -- help`.

Todavía no está publicado en npm (ver [docs/PUBLISHING.md](docs/PUBLISHING.md)).

## Estructura

```
src/
  lexer.ts      fuente → tokens
  parser.ts     tokens → AST (Pratt para expresiones JS)
  ast.ts        tipos del AST (estable, serializable a JSON)
  checker.ts    tipos, null-safety, errores con fixes
  codegen.ts    AST → módulo ES que crea DOM directo (sin virtual DOM)
  printer.ts    AST → código canónico (fmt, errores, context)
  context.ts    contexto compacto para LLMs
  elements.ts   tabla única de primitivas de UI
  errors.ts     catálogo de errores y formatos humano / IA
  compile.ts    pipeline completo
  cli.ts        comando `art`
runtime/runtime.js   signals + helpers de DOM (~2.3 KB brotli)
examples/            counter, todo
benchmarks/          tareas equivalentes en ArtScript / React / Svelte + medición
docs/SPEC.md         spec compacta para dar a una IA (~1.1K tokens)
templates/default/   proyecto base que crea `art init`
tests/               parser, checker, runtime, e2e (DOM en memoria), tools, docs
```

## Primeras mediciones

`node src/cli.ts bench`, tokenizer `o200k_base`:

| Tarea | ArtScript | React+TS | Svelte 5 |
|---|---|---|---|
| counter | 92 | 181 | 154 |
| todo | 245 | 471 | 400 |

Esto solo mide el **tamaño del código fuente**. Todavía no mide la spec en contexto, las iteraciones de un agente ni el costo en USD. Sin eso no se puede afirmar ahorro real (ver §12 del documento de viabilidad). Además, `o200k_base` es el tokenizer de OpenAI; los de Claude difieren.
