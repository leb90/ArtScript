# Saved specs and project rules

Copies of what an agent reads, kept to measure a wording change before and after with the same
compiler (`npm run eval -- --spec-file <spec> --art-rules <rules>`).

- `SPEC-0.2.11.md`, `SPEC-CORE-0.2.11.md`, `agents-0.2.11.md`: as of 0.2.11, before the rule about
  what goes in a `.ts` file was inverted ("write everything in .art; .ts only for code that drives
  the DOM or runs every frame").

## Measured (2026-10-16): the inverted rule

ArtScript only, two runs per cell, tasks `imp-particles` (a canvas simulation: its engine belongs in
a `.ts` file) and `exp-travelers` (sample data, date and money formats, avatars: they belong in
`.art`). "Before" is `--spec-file SPEC-0.2.11.md --art-rules agents-0.2.11.md`; the others are
`docs/SPEC.md` and `templates/default/AGENTS.md` at the time. Same compiler and harness for the
three rows (after the tolerances these runs led to). USD 3.19 spent in all, earlier rounds included.

| Rule | Solved | First attempt | USD per solved task | Answers with `.ts`: data task | Answers with `.ts`: canvas task |
|---|---|---|---|---|---|
| Before (0.2.11: heavy code in `.ts`; "ArtScript is for the page, …") | 10/12 | 6/12 | 0.0659 | 6/6 | 5/6 |
| v2: everything in `.art`; "use a `.ts` file only for imperative code" | 10/12 | 7/12 | 0.0622 | 0/6 | 1/6 |
| **v3 (shipped): everything in `.art`; "imperative code goes in a `.ts` file instead"** | 9/12 | 8/12 | 0.0694 | 1/6 | 4/6 |

Per model, USD per solved task (solved/4): before Sonnet 0.0460 (4), Haiku 0.0695 (2), Opus 0.0840 (4);
v2 0.0405 (4), 0.0542 (2), 0.0879 (4); v3 0.0363 (4), 0.1319 (1), 0.0869 (4).

- The habit is gone: with either new wording, sample data and formatters go to `.art` (Sonnet and
  Opus 0/4 answers with `.ts`; before 4/4).
- v2 also moved the canvas engines into `.art` (1/6 kept `sim.ts`), the opposite of what lowered the
  cost of that task on 2026-10-09; v3 says it as an instruction both ways and keeps them in `.ts`
  (4/6). v3 is the best for Sonnet (−21% against before) and gets the most first attempts; Opus is
  level within noise. Haiku's failures in every row are its own (formats, syntax, a flag on the
  wrong element), and two runs per cell can't separate them from the wording.
- With v2's first wording ("data, constants, helpers, formatting and calls to npm packages") Haiku
  reached for `date-fns` in every attempt to format DD/MM/YYYY; the shipped text says formatting is
  `Intl`, `Date` and string methods.
- What these runs led to in the compiler: `use "./x.art" { … }` is dropped (agents import between
  `.art` files as in JavaScript), props in JSX braces, `const a = 1, b = 2`, `link … bold`; in the
  harness, answers with modules in folders.

Raw data: `results/2026-10-16T20-*.json` and `2026-10-16T21-0*.json` (before: `20-56-02` Sonnet,
`20-57-17` Haiku, `20-58-21` Opus; v2: `20-56-28`, `20-57-53`, `20-58-47`; v3: `20-59-58`,
`21-00-46`, `21-01-11`; the `20-4*` files are the first round, before the tolerances).
