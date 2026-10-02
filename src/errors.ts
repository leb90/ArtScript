// Structured errors. Same object for humans (`art check`) and AI (`art check --ai`).
import type { Loc } from "./ast.ts";

export type Diagnostic = {
  code: string;
  type: string;
  msg: string;
  loc: Loc;
  at?: string; // component/model where it happens, e.g. "UserCard"
  expr?: string;
  expected?: string;
  actual?: string;
  fixes?: string[];
};

// Single error catalog: source for the docs (`docs/errors`).
export const CATALOG: Record<string, { code: string; desc: string }> = {
  // Syntax
  UNEXPECTED_CHAR: { code: "E0001", desc: "Invalid character in the source." },
  UNTERMINATED_STRING: { code: "E0002", desc: "Unterminated string." },
  UNEXPECTED_TOKEN: { code: "E0003", desc: "Unexpected token; something else was expected." },
  // Names
  UNDEFINED_NAME: { code: "E1001", desc: "Name not defined in this scope." },
  DUPLICATE_NAME: { code: "E1002", desc: "Name declared twice." },
  UNKNOWN_TYPE: { code: "E1003", desc: "Unknown type." },
  // Types
  TYPE_MISMATCH: { code: "E1010", desc: "The value's type doesn't match the expected one." },
  UNKNOWN_FIELD: { code: "E1011", desc: "The model has no such field." },
  MISSING_FIELD: { code: "E1012", desc: "A required model field is missing." },
  POSSIBLY_EMPTY: { code: "E1023", desc: "The value may be null; that case must be handled." },
  NOT_A_LIST: { code: "E1024", desc: "`for` needs a list." },
  // Assignment
  ASSIGN_READONLY: { code: "E1030", desc: "Only `state` and `let` variables can be assigned." },
  TEXT_BRACES: { code: "E1060", desc: "`{name}` inside a plain string isn't interpolated; use a template `${name}`." },
  UNKNOWN_MODULE: { code: "E1050", desc: "The module of a `use` can't be found (not installed, or a wrong path)." },
  UNKNOWN_EXPORT: { code: "E1051", desc: "The module doesn't export that name." },
  AUTH_REQUIRED: { code: "E1040", desc: "`login` and `private` need an `auth` declaration." },
  // View
  UNKNOWN_ELEMENT: { code: "E2001", desc: "Unknown UI element or component." },
  UNKNOWN_PROP: { code: "E2002", desc: "Invalid prop for this element or component." },
  MISSING_PROP: { code: "E2003", desc: "A required prop is missing (component props, or `options` of select/radio/tabs)." },
  NO_ACTION: { code: "E2004", desc: "This element doesn't take an `->` action." },
  NO_CONTENT: { code: "E2005", desc: "This element doesn't take content." },
  NOT_BINDABLE: { code: "E2006", desc: "`input`, `select`, `checkbox`, `modal`, etc. need a `state` (or a field of one) to bind to." },
  LAYOUT_SLOT: { code: "E2008", desc: "A layout needs exactly one `slot`, and `slot` only goes in layouts." },
  BAD_ROUTE: { code: "E2009", desc: "Invalid or repeated page route." },
  LAYOUT_CYCLE: { code: "E2011", desc: "A layout ends up inside itself through `layout` (Docs inside Site inside Docs)." },
  BAD_CLEANUP: { code: "E2010", desc: "`cleanup { }` only goes inside `mount { }` or `effect { }`." },
  NO_CHILDREN: { code: "E2007", desc: "This element doesn't take `{ }` children." },
  // art patch
  PATCH_SYNTAX: { code: "E3001", desc: "Invalid patch line: an operation was expected." },
  TARGET_NOT_FOUND: { code: "E3002", desc: "The patch path doesn't exist." },
  AMBIGUOUS_TARGET: { code: "E3003", desc: "The path matches several nodes: add an index `[n]`." },
  PATCH_BODY: { code: "E3004", desc: "The patch body isn't valid for that target." },
};

export function diag(type: keyof typeof CATALOG, msg: string, loc: Loc, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code: CATALOG[type].code, type, msg, loc, ...extra };
}

export class CompileError extends Error {
  diagnostic: Diagnostic;
  constructor(d: Diagnostic) {
    super(d.msg);
    this.diagnostic = d;
  }
}

export function fmtLoc(l: Loc): string {
  return `${l.file}:${l.line}:${l.col}`;
}

// Human-readable output.
export function formatHuman(d: Diagnostic): string {
  let s = `${fmtLoc(d.loc)} error ${d.code} ${d.type}: ${d.msg}`;
  if (d.expected) s += `\n  expected: ${d.expected}`;
  if (d.actual) s += `\n  actual:   ${d.actual}`;
  if (d.fixes?.length) s += `\n  fix:      ${d.fixes.join("  |  ")}`;
  return s;
}

// AI output: one JSON line per error, only non-empty fields, no redundant prose.
export function formatAI(d: Diagnostic): string {
  const o: Record<string, unknown> = { code: d.code, type: d.type, loc: fmtLoc(d.loc) };
  if (d.at) o.at = d.at;
  if (d.expr) o.expr = d.expr;
  if (d.expected) o.expected = d.expected;
  if (d.actual) o.actual = d.actual;
  if (d.fixes?.length) o.fixes = d.fixes;
  if (!d.expected && !d.fixes?.length) o.msg = d.msg;
  return JSON.stringify(o);
}

// Edit distance, used to suggest similar names.
export function suggest(name: string, candidates: Iterable<string>, max = 3): string[] {
  const scored: [string, number][] = [];
  for (const c of candidates) {
    if (c === name) continue; // suggesting the same name is never a fix
    const d = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (d <= Math.max(2, Math.floor(name.length / 3))) scored.push([c, d]);
  }
  return scored.sort((a, b) => a[1] - b[1]).slice(0, max).map((x) => x[0]);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
