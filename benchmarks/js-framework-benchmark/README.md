# ArtScript in js-framework-benchmark

The [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) app (keyed), written in ArtScript: [src/app.art](src/app.art). It passes the benchmark's `isKeyed` check.

## Run it with the benchmark's harness

In a clone of js-framework-benchmark:

```sh
cp -r <ArtScript>/benchmarks/js-framework-benchmark frameworks/keyed/artscript
cd frameworks/keyed/artscript
npm install            # writes the package-lock.json the harness requires
npm run build-prod     # art build src --out dist
```

To measure a compiler that isn't published yet, build with this repository's (`node <ArtScript>/src/cli.ts build src --out dist`) and set `"frameworkVersion"` instead of `frameworkVersionFromPackage` in `package.json`.

Then, from the clone's root (Node 20+; `server` and `webdriver-ts` installed with `npm ci`, `webdriver-ts` compiled with `npm run compile`):

```sh
npm start                                         # server on :8080, in its own terminal
cd webdriver-ts
npm run isKeyed -- --headless --framework keyed/artscript
npm run bench -- --headless --framework keyed/artscript keyed/vanillajs keyed/react-hooks
npm run results                                   # webdriver-ts-results/table.html
```
