// Pipeline: fuente → lexer → parser → AST → checker → codegen → JS.
import type { Program } from "./ast.ts";
import { check } from "./checker.ts";
import { generate } from "./codegen.ts";
import { CompileError, type Diagnostic } from "./errors.ts";
import { parse } from "./parser.ts";

export type Source = { file: string; src: string };
export type Result = { program: Program; diagnostics: Diagnostic[]; js: string | null };

// Un proyecto es un solo Program aunque esté repartido en varios archivos.
export function parseProject(sources: Source[]): { program: Program; diagnostics: Diagnostic[] } {
  const program: Program = { kind: "Program", decls: [] };
  const diagnostics: Diagnostic[] = [];
  for (const s of sources) {
    try {
      program.decls.push(...parse(s.src, s.file).decls);
    } catch (e) {
      if (e instanceof CompileError) diagnostics.push(e.diagnostic);
      else throw e;
    }
  }
  return { program, diagnostics };
}

export function compile(sources: Source[]): Result {
  const { program, diagnostics } = parseProject(sources);
  if (diagnostics.length) return { program, diagnostics, js: null };
  const errs = check(program);
  if (errs.length) return { program, diagnostics: errs, js: null };
  return { program, diagnostics: [], js: generate(program) };
}
