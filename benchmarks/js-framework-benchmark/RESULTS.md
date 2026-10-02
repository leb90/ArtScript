# Local results

A local run of js-framework-benchmark's own harness (commit `f2df01a`, 2026-09-20), **not the official results**: Chrome 154 headless, Apple M4, 7 runs per benchmark (the official runs use 15), 2026-10-02. ArtScript 0.2 (unreleased) against the implementations in that repository: vanillajs, Solid 1.9.3, Svelte 5.42.1, Vue 3.5.39 and React 19.2.0 (hooks). All keyed; ArtScript passes the harness's `isKeyed` check.

Median duration in milliseconds (lower is better). "Before" is the same ArtScript app before the runtime changes this run led to: bindings that skip unchanged writes, keyed moves only outside the longest increasing subsequence, rows re-rendered only when their fields changed, and no marker comments around single-element rows.

| Benchmark | ArtScript before | **ArtScript** | vanillajs | Solid | Svelte | Vue | React |
|---|---|---|---|---|---|---|---|
| create 1,000 rows | 26.2 | **24.7** | 21.5 | 22.7 | 22.6 | 26.0 | 26.0 |
| replace 1,000 rows | 31.5 | **29.4** | 23.2 | 25.8 | 26.3 | 28.8 | 31.7 |
| update every 10th row (x16) | 61.9 | **23.3** | 13.1 | 12.8 | 15.6 | 15.0 | 16.4 |
| select row | 7.1 | **4.9** | 3.3 | 8.4 | 7.3 | 4.6 | 6.5 |
| swap rows | 121.0 | **19.1** | 13.3 | 17.4 | 16.8 | 15.4 | 115.1 |
| remove row | 29.0 | **13.2** | 13.5 | 11.6 | 12.7 | 16.4 | 14.8 |
| create 10,000 rows | 297.4 | **283.3** | 226.1 | 238.6 | 244.4 | 274.5 | 446.8 |
| append 1,000 rows (x2) | 40.7 | **31.5** | 28.5 | 25.4 | 27.4 | 30.0 | 31.8 |
| clear 1,000 rows (x8) | 19.8 | **12.8** | 10.4 | 13.6 | 12.5 | 14.0 | 19.1 |

Memory (MB), size and first paint, after the changes:

| | **ArtScript** | vanillajs | Solid | Svelte | Vue | React |
|---|---|---|---|---|---|---|
| ready memory | **0.6** | 0.6 | 0.6 | 0.7 | 0.8 | 1.2 |
| run memory (1,000 rows) | **3.3** | 1.8 | 2.7 | 2.9 | 3.9 | 4.4 |
| run and clear memory | **0.8** | 0.7 | 0.8 | 1.0 | 1.2 | 2.0 |
| size, compressed (KB) | **5.8** | 2.5 | 4.5 | 9.7 | 23.3 | 51.4 |
| first paint (ms) | **47.3** | 46.9 | 46.7 | 70.8 | 98.9 | 292.2 |

## Reading

- ArtScript is now within the group of Solid, Svelte and Vue on most operations: fastest of the frameworks on "select row", between Solid and Svelte on "swap rows", on par with vanillajs on "remove row".
- It's still behind on "update every 10th row" (about 1.5–1.8× Solid, Svelte and Vue) and "create 10,000 rows" (on par with Vue, about 1.2× Solid). Part of it is script under the benchmark's 16× CPU throttling (the mutation goes through a `forEach` parameter, which notifies every state), part is paint.
- The size includes the whole runtime (signals, router, api client); there is no tree-shaking of the runtime yet.
