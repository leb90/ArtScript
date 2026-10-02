# tree-sitter-artscript

A [tree-sitter](https://tree-sitter.github.io) grammar for ArtScript (`.art`): syntax highlighting in Zed, Neovim, Helix and any other editor that uses tree-sitter. The CSS inside a component's `style { }` is highlighted as CSS.

- `grammar.js`: the grammar. It mirrors the compiler's parser (`src/parser.ts`).
- `src/scanner.c`: line endings (a line break ends a statement unless the next line starts with `?`, `:`, `.`, `&&`, `||` or `??`), template strings and raw CSS.
- `queries/highlights.scm`, `queries/injections.scm`: highlighting.
- `src/parser.c` and the rest of `src/`: generated, committed so editors can build the parser without the tree-sitter CLI.

## Working on it

```sh
npm install              # tree-sitter-cli (a dev tool; needs a C compiler)
npm run generate         # after changing grammar.js
npm test                 # test/corpus
npm run parse-examples   # every example, the website and the benchmark app must parse without errors
```

A change of syntax in the compiler goes here too (see CONTRIBUTING.md at the root). The list of elements without content at the top of `grammar.js` is checked against `src/elements.ts` by the repository's tests.

## Neovim

```lua
vim.filetype.add({ extension = { art = "artscript" } })
require("nvim-treesitter.parsers").get_parser_configs().artscript = {
  install_info = {
    url = "https://github.com/leb90/ArtScript",
    location = "editors/tree-sitter-artscript",
    files = { "src/parser.c", "src/scanner.c" },
    branch = "main",
  },
  filetype = "artscript",
}
```

Then `:TSInstall artscript`, and copy `queries/*.scm` to `~/.config/nvim/queries/artscript/`.

## Helix

In `~/.config/helix/languages.toml`:

```toml
[[language]]
name = "artscript"
scope = "source.art"
file-types = ["art"]
comment-token = "//"
indent = { tab-width = 2, unit = "  " }

[[grammar]]
name = "artscript"
source = { git = "https://github.com/leb90/ArtScript", rev = "main", subpath = "editors/tree-sitter-artscript" }
```

Then `hx --grammar fetch && hx --grammar build`, and copy `queries/*.scm` to `~/.config/helix/runtime/queries/artscript/`.
