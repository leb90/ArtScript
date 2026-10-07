# Results

## Official results (Chrome 154, 2026-10-04)

ArtScript 0.2.4 is in the [official js-framework-benchmark results](https://krausest.github.io/js-framework-benchmark/2026/chrome154.html) since Chrome 154 (merged in [#2114](https://github.com/krausest/js-framework-benchmark/pull/2114)). Median duration in milliseconds from `webdriver-ts/results.json` of that run (lower is better); the score is the geometric mean of each framework's ratio to the fastest keyed implementation over the nine CPU benchmarks, as the official table computes it.

| Benchmark | **ArtScript 0.2.4** | Solid 1.9.3 | Svelte 5.42 | Vue 3.5 | React 19.2 (hooks) |
|---|---|---|---|---|---|
| create 1,000 rows | **24.7** | 21.7 | 22.1 | 24.5 | 23.6 |
| replace 1,000 rows | **28.2** | 23.9 | 24.9 | 27.2 | 30.2 |
| update every 10th row (x16) | **11.8** | 10.4 | 10.9 | 12.6 | 14.7 |
| select row | **3.9** | 3.2 | 5.0 | 3.7 | 5.4 |
| swap rows | **14.1** | 12.5 | 13.0 | 13.1 | 89.7 |
| remove row | **11.3** | 10.2 | 10.5 | 12.7 | 11.3 |
| create 10,000 rows | **275.6** | 228.8 | 231.9 | 258.7 | 401.0 |
| append 1,000 rows (x2) | **28.6** | 24.7 | 25.1 | 27.3 | 29.3 |
| clear rows (x8) | **10.6** | 10.6 | 10.4 | 12.6 | 17.6 |
| **Score** (1.00 = fastest) | **1.32** | 1.16 | 1.24 | 1.33 | 1.91 |
| Rank among 196 keyed implementations | **85** | 45 | 67 | 89 | 155 |
| Compressed size | **7.5 KB** | 4.5 KB | 9.7 KB | 23.3 KB | 51.4 KB |
| Memory after creating 1,000 rows | **3.4 MB** | 2.7 MB | 2.9 MB | 3.9 MB | 4.4 MB |

In short: between Svelte and Vue, 1.14× Solid, 1.45× faster than React by the same score; the only operation where it ties the fastest is clearing rows, and the slowest relative to Solid is creating 10,000 rows (1.20×). Memory is the weakest column (3.4 MB vs Solid's 2.7).

## Local results

A local run of js-framework-benchmark's own harness (commit `f2df01a`, 2026-09-20), **not the official results**: Chrome 154 headless, Apple M4, 10 runs per benchmark (the official runs use 15), 2026-10-02. ArtScript 0.2 (unreleased) against the implementations in that repository: vanillajs, Solid 1.9.3, Svelte 5.42.1, Vue 3.5.39 and React 19.2.0 (hooks). All keyed; ArtScript passes the harness's `isKeyed` check.

Median duration in milliseconds (lower is better). "Before" is the same app at the previous published run (earlier the same day, 7 runs), before the changes described below.

| Benchmark | ArtScript before | **ArtScript** | vanillajs | Solid | Svelte | Vue | React |
|---|---|---|---|---|---|---|---|
| create 1,000 rows | 24.7 | **24.1** | 20.8 | 21.8 | 22.2 | 24.6 | 25.6 |
| replace 1,000 rows | 29.4 | **27.8** | 22.0 | 24.3 | 24.9 | 27.6 | 30.2 |
| update every 10th row (x16) | 23.3 | **12.4** | 11.8 | 11.4 | 12.3 | 16.6 | 14.8 |
| select row | 4.9 | **4.9** | 3.1 | 6.7 | 7.5 | 4.8 | 6.3 |
| swap rows | 19.1 | **16.7** | 12.5 | 14.8 | 15.1 | 15.2 | 93.0 |
| remove row | 13.2 | **13.1** | 10.6 | 11.7 | 12.2 | 13.2 | 14.5 |
| create 10,000 rows | 283.3 | **284.2** | 225.8 | 247.2 | 252.3 | 270.2 | 432.7 |
| append 1,000 rows (x2) | 31.5 | **28.0** | 23.8 | 26.3 | 25.6 | 29.4 | 30.9 |
| clear 1,000 rows (x8) | 12.8 | **12.6** | 9.8 | 12.2 | 11.0 | 12.3 | 17.9 |

"update every 10th row" is from a run of that benchmark alone for the six implementations: in the full run the machine was busy while the others were measured, which inflated their numbers under the 16x CPU throttling (Solid 17.4, vanillajs 17.5); ArtScript measured 12.0 there and 12.4 alone.

Memory (MB), size and first paint. ArtScript was measured again; the others are from the previous run (same harness commit):

| | **ArtScript** | vanillajs | Solid | Svelte | Vue | React |
|---|---|---|---|---|---|---|
| ready memory | **0.5** | 0.6 | 0.6 | 0.7 | 0.8 | 1.2 |
| run memory (1,000 rows) | **3.4** | 1.8 | 2.7 | 2.9 | 3.9 | 4.4 |
| run and clear memory | **0.8** | 0.7 | 0.8 | 1.0 | 1.2 | 2.0 |
| size, compressed (KB) | **6.0** | 2.5 | 4.5 | 9.7 | 23.3 | 51.4 |
| first paint (ms) | **45.4** | 46.9 | 46.7 | 70.8 | 98.9 | 292.2 |

## What changed for "update every 10th row" (23.3 → 12.4 ms, 1.09x Solid)

Measured one at a time with the harness (script and paint are the harness's own breakdown, under 16x CPU throttling):

| | total | script | paint |
|---|---|---|---|
| before | 26.7 | 9.6 | 14.7 |
| the compiler notifies the iterated state, notifications coalesce, rows in place skip reconciling | 15.5 | 1.8 | 12.5 |
| and the table renders inside a block instead of being a flex item | 13.1–13.8 | 1.8 | 10.4 |

- `rows.forEach(r => r.label = ...)` mutated through an arrow parameter, so every assignment notified every state (each marking the thousand row effects that read `selected`). The compiler now knows the callback's item belongs to `rows` and notifies only that state; a signal notified again before the flush, with no new subscriber, doesn't walk its subscribers again; and the keyed list checks first whether the rows at the start are where they were (all of them here), comparing each item with its snapshot without building a new one.
- The rest was layout: a `<table>` that is a direct child of a flex container (`column`) takes Chrome about 30% longer to lay out after a text change than the same table inside a plain block (1.45 ms against 1.08 ms per update of 100 cells, unthrottled, measured in the page with forced layouts). `table` now renders inside a `<div>`, which also lets a wide table scroll sideways.
- Tried and discarded (no measurable gain): writing the text node's `data` instead of `textContent`; `contain: layout`, `flex: none` and `min-height: 0` on the table; a grid instead of a flex column (slower).

## Reading

- ArtScript is within the group of Solid, Svelte and Vue on every operation: fastest of the frameworks on "select row" with Vue, about 1.1x Solid on "update every 10th row", "swap rows", "remove row", "create" and "append", level with Solid on "clear".
- It's still behind on "create 10,000 rows" (1.15x Solid, 1.05x Vue) and it uses more memory per row than Solid and Svelte (3.4 MB against 2.7–2.9 for 1,000 rows): each row keeps a snapshot of its item to detect in-place changes.
- The size includes the runtime the app uses (signals, keyed lists, router) and its base CSS.
