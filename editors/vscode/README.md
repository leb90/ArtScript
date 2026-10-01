# ArtScript for VS Code

Highlighting for `.art` files, plus live errors (with the compiler's fixes), formatting (`art fmt`) and completion of elements, props, flags and components, through `art lsp`.

The extension runs the project's `node_modules/.bin/art lsp` (or `art` on the PATH); set `artscript.command` to change it. It has no dependencies.

Other editors (Neovim, Zed, Helix, ...) can use `art lsp` directly as a language server for `.art` files.
