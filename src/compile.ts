// Pipeline: source → lexer → parser → AST → checker → codegen → JS.
import type { Program } from "./ast.ts";
import { check } from "./checker.ts";
import { generate, serverSchema, type ServerSchema } from "./codegen.ts";
import type { Diagnostic } from "./errors.ts";
import { parseAll } from "./parser.ts";

export type Source = { file: string; src: string };
// `server`: what the server runtime needs when the program declares apis (null otherwise).
export type Result = { program: Program; diagnostics: Diagnostic[]; js: string | null; server: ServerSchema | null };

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

export function compile(sources: Source[]): Result {
  const { program, diagnostics } = parseProject(sources);
  if (diagnostics.length) return { program, diagnostics, js: null, server: null };
  const errs = check(program);
  if (errs.length) return { program, diagnostics: errs, js: null, server: null };
  return { program, diagnostics: [], js: generate(program), server: serverSchema(program) };
}
