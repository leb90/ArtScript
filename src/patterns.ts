// Destructuring in parameters and `let` (`({ name, city }) => ...`, `fn f({ a, b = 1 })`,
// `let [first, ...rest] = xs`). A pattern is kept as its canonical text, which is also valid
// JavaScript, so codegen emits it as is; its defaults are literals.

// The names a parameter or `let` binds: itself, or every name its pattern binds.
export function boundNames(p: string): string[] {
  if (p[0] !== "{" && p[0] !== "[") return [p];
  const bare = p
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "") // string defaults
    .replace(/=\s*[^,}\]]+/g, "") // defaults (literals)
    .replace(/[A-Za-z_$][\w$]*\s*:/g, ""); // `key:` before the name or pattern it binds
  return [...bare.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]).filter((n) => !["true", "false", "null", "undefined"].includes(n));
}

export const isPattern = (p: string) => p[0] === "{" || p[0] === "[";
