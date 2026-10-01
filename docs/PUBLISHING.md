# Publishing to npm (once the MVP is stable)

**Not published yet.** `package.json` has `"private": true`, which blocks an accidental `npm publish`.

## What's ready

- Free names on npm (checked 2026-09-30): `artscript` and `create-artscript`.
- `npm run build` compiles `src/*.ts` → `lib/*.js` + `.d.ts` types. Node doesn't run TypeScript inside `node_modules`, so the package ships JS.
- `bin: art → lib/cli.js`, `files` (lib, runtime, templates, docs/SPEC.md), `exports`, `engines: node >=24`, MIT license, repository and metadata.
- `prepack` builds automatically; `prepublishOnly` runs tests + typecheck.
- No install scripts (`postinstall`/`prepare`): npm shows no security warnings on install.
- Tested: `npm pack` → install the `.tgz` in an empty folder → `art init` → `npm install` → `check`, `build` and `dev` work.

## Checklist before publishing

1. [ ] Stable MVP: real database, `for` with keys, `fmt` that keeps comments.
2. [x] Agent cost eval (`npm run eval`) with a favorable result.
3. [ ] Pick the first version (`0.1.0` signals "experimental"; semver 0.x allows breaking changes).
4. [x] README in English.
5. [ ] Create the `create-artscript` package so `npm create artscript@latest my-app` works (today: `npx art init my-app`).
6. [ ] Remove `"private": true` from `package.json`.
7. [ ] `npm login` (the author's npm account, with 2FA).
8. [ ] `npm publish --access public` (try `--dry-run` first).
9. [ ] Git tag: `git tag v0.1.0 && git push --tags`.

## Trying the package locally without publishing

```sh
npm pack                                   # creates artscript-0.1.0.tgz
cd /tmp && mkdir try && cd try
npm init -y && npm i /path/to/artscript-0.1.0.tgz
npx art init my-app
```

`art init` run from the repo (not installed) points the new project at the local copy (`file:`); installed from npm it points at `^<version>`.
