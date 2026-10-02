# Publishing to npm

Two packages, both at the same version:

- `@artscript/core` (this repository's root): the compiler, the `art` command, the runtime and the templates. npm rejects the unscoped name `artscript` as too similar to `rescript`, so the package lives in the `artscript` organization.
- `create-artscript` (`packages/create-artscript`): what `npm create artscript@latest my-app` runs. It depends on `@artscript/core` and calls `art init`.

## What's in `@artscript/core`

- `npm run build` compiles `src/*.ts` → `lib/*.js` + `.d.ts` types (Node doesn't run TypeScript inside `node_modules`); `prepack` runs it, `prepublishOnly` runs the tests and the typecheck.
- `files`: `lib`, `runtime`, `templates`, the two specs, `llms.txt` and the usual notices. No tests, benchmarks, website or examples.
- No install scripts.

## Releasing a version

1. Set the same `version` in `package.json` and `packages/create-artscript/package.json` (and the `@artscript/core` range there), and move the CHANGELOG's "Unreleased" under it.
2. Try it without publishing:
   ```sh
   npm pack                                   # artscript-core-<version>.tgz
   cd /tmp && mkdir try && cd try && npm init -y
   npm i /path/to/artscript-core-<version>.tgz
   npx art init my-app && cd my-app          # then point its dependency at the .tgz, npm install,
   npx art check && npx art build            # and run check, build and dev
   ```
3. `npm publish --access public` in the root, then in `packages/create-artscript` (both ask for the account's one-time password).
4. `npm view @artscript/core version`, then `npm create artscript@latest my-app` in an empty folder.
5. `git tag v<version> && git push --tags`.

`art init` run from the repository (not installed) points the new project at the local copy (`file:`); installed from npm it points at `^<version>`.
