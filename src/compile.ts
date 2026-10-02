// Pipeline: source → lexer → parser → AST → checker → codegen → JS.
import type { Program } from "./ast.ts";
import { check } from "./checker.ts";
import { generateMapped, serverSchema, sourceMap, type ServerSchema } from "./codegen.ts";
import type { Diagnostic } from "./errors.ts";
import { parseAll } from "./parser.ts";

export type Source = { file: string; src: string };
// `server`: what the server runtime needs when the program declares apis (null otherwise).
// `map`: a source map (JSON) from the JS back to the .art sources.
export type Result = { program: Program; diagnostics: Diagnostic[]; js: string | null; server: ServerSchema | null; map?: string };

// A project is a single Program even when split across several files.
export function parseProject(sources: Source[]): { program: Program; diagnostics: Diagnostic[] } {
  const program: Program = { kind: "Program", decls: [] };
  const diagnostics: Diagnostic[] = [];
  // Every syntax error of every file is reported at once (an AI fixes them in one round).
  for (const s of sources) {
    const r = parseAll(s.src, s.file);
    program.decls.push(...r.program.decls);
    diagnostics.push(...r.errors);
  }
  return { program, diagnostics };
}

// `dev`: the components report their props, states, computed and data to the dev tools
// (runtime/devtools.js); only `art dev` asks for it.
export function compile(sources: Source[], options: { dev?: boolean } = {}): Result {
  const { program, diagnostics } = parseProject(sources);
  if (diagnostics.length) return { program, diagnostics, js: null, server: null };
  const errs = check(program);
  if (errs.length) return { program, diagnostics: errs, js: null, server: null };
  const { js, marks } = generateMapped(program, options.dev);
  return { program, diagnostics: [], js, server: serverSchema(program), map: sourceMap(marks, sources) };
}
