// Errores estructurados. Mismo objeto para humanos (`art check`) y para IA (`art check --ai`).
import type { Loc } from "./ast.ts";

export type Diagnostic = {
  code: string;
  type: string;
  msg: string;
  loc: Loc;
  at?: string; // componente/modelo donde ocurre, ej. "UserCard"
  expr?: string;
  expected?: string;
  actual?: string;
  fixes?: string[];
};

// Catálogo único de errores: fuente para la documentación (`docs/errors`).
export const CATALOG: Record<string, { code: string; desc: string }> = {
  // Sintaxis
  UNEXPECTED_CHAR: { code: "E0001", desc: "Carácter no válido en el código fuente." },
  UNTERMINATED_STRING: { code: "E0002", desc: "String sin cerrar." },
  UNEXPECTED_TOKEN: { code: "E0003", desc: "Token inesperado; se esperaba otra cosa." },
  // Nombres
  UNDEFINED_NAME: { code: "E1001", desc: "Nombre no definido en este alcance." },
  DUPLICATE_NAME: { code: "E1002", desc: "Nombre declarado dos veces." },
  UNKNOWN_TYPE: { code: "E1003", desc: "Tipo desconocido." },
  // Tipos
  TYPE_MISMATCH: { code: "E1010", desc: "El tipo del valor no coincide con el esperado." },
  UNKNOWN_FIELD: { code: "E1011", desc: "El modelo no tiene ese campo." },
  MISSING_FIELD: { code: "E1012", desc: "Falta un campo obligatorio del modelo." },
  POSSIBLY_EMPTY: { code: "E1023", desc: "El valor puede ser null; hay que manejar ese caso." },
  NOT_A_LIST: { code: "E1024", desc: "`for` necesita una lista." },
  // Asignación
  ASSIGN_READONLY: { code: "E1030", desc: "Solo se puede asignar a `state` o variables `let`." },
  // Vista
  UNKNOWN_ELEMENT: { code: "E2001", desc: "Elemento de UI o componente desconocido." },
  UNKNOWN_PROP: { code: "E2002", desc: "Prop no válida para este elemento o componente." },
  MISSING_PROP: { code: "E2003", desc: "Falta una prop obligatoria del componente." },
  NO_ACTION: { code: "E2004", desc: "Este elemento no acepta acción `->`." },
  NO_CONTENT: { code: "E2005", desc: "Este elemento no acepta contenido." },
  NOT_BINDABLE: { code: "E2006", desc: "`input` necesita un `state` (o campo de un state) para enlazar." },
  NO_CHILDREN: { code: "E2007", desc: "Este elemento no acepta hijos `{ }`." },
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

// Salida para humanos.
export function formatHuman(d: Diagnostic): string {
  let s = `${fmtLoc(d.loc)} error ${d.code} ${d.type}: ${d.msg}`;
  if (d.expected) s += `\n  esperado: ${d.expected}`;
  if (d.actual) s += `\n  actual:   ${d.actual}`;
  if (d.fixes?.length) s += `\n  fix:      ${d.fixes.join("  |  ")}`;
  return s;
}

// Salida para IA: una línea JSON por error, solo campos con valor, sin prosa redundante.
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

// Distancia de edición para sugerir nombres parecidos.
export function suggest(name: string, candidates: Iterable<string>, max = 3): string[] {
  const scored: [string, number][] = [];
  for (const c of candidates) {
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
