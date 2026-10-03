# Status

What is measured, what is proven in use, and what isn't yet. Updated with every release; the numbers come from the repository's own data.

**Version 0.2 (October 2026).** Usable for prototypes and small apps built with an AI agent. The syntax may still change before 1.0; every change is listed in the changelog with what to write instead.

## Measured

- **Cost:** over 50 tasks, three models and five stacks, ArtScript cost 50% less per working result than React + TypeScript with Claude Sonnet 5.5, 45% less with Opus 5.5 and 40% less with Haiku 4.5, and less than Svelte, Vue and Solid with each. Sonnet and Opus solved 100% of the tasks; Haiku 90% (86–89% in the other stacks). Raw data and method: [Benchmarks](/benchmarks).
- **Performance:** in js-framework-benchmark's own harness (run locally), within the group of Solid, Svelte and Vue on every operation; apps ship 5–20 KB of JavaScript. [Submitted](https://github.com/krausest/js-framework-benchmark/pull/2114) to the official benchmark.
- **Tests:** 215 in CI, covering the compiler, the runtime, the server, the dev tools and every example and guide on this site.

## Proven in use

- Three apps built by AI agents with the published package and only the spec: [a shop, a backoffice and a landing page](/examples). Every bug they found is fixed.
- This website is an ArtScript app.
- The three apps run as static demos (their backend in your browser). **No ArtScript server has run in production with real users yet.**

## Not yet

- **Security audit.** The server has CSRF protection, rate limits, security headers, hashed passwords and sessions that expire, and the [security policy](/reference/security) explains what apps get by default. Nobody outside the project has audited it. Don't put other people's sensitive data in an ArtScript app before that happens.
- **Frozen syntax.** Planned for 0.3. Until then, a release can change the language; `art fmt` and the changelog tell what to write instead.
- **Small models.** With Haiku 4.5, one task in ten needed a human. Use Sonnet or Opus for real work.
- **Database:** SQLite only, one process. Every field is indexed (measured: inserts and `where`/`sort` queries stay at 0.3 ms and 2 ms with 64,000 rows; `search` scans the table). Enough for small and medium apps; no Postgres yet.
- **Known gaps:** prerendered pages are replaced, not hydrated, when the app loads (a brief flash); server functions aren't transactional; with `api users: User login`, any signed-in user can list every account (being decided); no OAuth or email in the static demo mode.
- **One maintainer** ([Leandro Bisceglie](https://github.com/leb90)). Issues are answered, but not within hours.

## How to help

[Open an issue](https://github.com/leb90/ArtScript/issues) with a `.art` file that shows the problem, or tell us what your agent got wrong and what it wrote: that's how most fixes here started.
