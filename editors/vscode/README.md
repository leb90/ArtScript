# ArtScript for VS Code and Cursor

Everything `.art` files need in the editor: a file icon, highlighting, snippets (`page`, `component`, `model`, `for`, `test`...), live errors with the compiler's fixes, formatting (`art fmt`), completion of elements, props, flags and components, go to definition, hover and rename, through `art lsp`.

The extension runs the project's `node_modules/.bin/art lsp` (or `art` on the PATH); set `artscript.command` to change it. It has no dependencies.

Projects made with `npm create artscript@latest` recommend this extension (`LeandroBisceglie.artscript`) (`.vscode/extensions.json`), so VS Code and Cursor offer to install it when the project is opened.

Other editors (Neovim, Zed, Helix, ...) can use `art lsp` directly as a language server for `.art` files, and the tree-sitter grammar in `editors/tree-sitter-artscript` for highlighting.
