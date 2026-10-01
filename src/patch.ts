// `art patch`: structured edits on the AST, so an AI changes a few nodes instead of rewriting files.
//
//   replace Todos/column/row/button[1]      replace a view node, member (Todos.add), field (Todo.title) or declaration
//     button "Add" primary -> add()
//   insert before|after <path>              insert siblings next to the target
//   append <path>                           add children (element / if / else / for), members or view (component), fields (model)
//   remove <path>
//   set <view path> gap=6 muted -align      set props/flags on an element; `-name` removes one
//   add [file.art]                          add new top-level declarations
//
// Operations apply in order. The whole patch is atomic: if any operation fails or the result
// doesn't typecheck, nothing is written.
import type { ComponentDecl, Decl, Element, Field, Loc, Member, ModelDecl, Program, ViewNode } from "./ast.ts";
import { check } from "./checker.ts";
import { parseProject, type Source } from "./compile.ts";
import { CompileError, diag, suggest, type Diagnostic } from "./errors.ts";
import { parse, parseComponentBody, parseFields } from "./parser.ts";
import { printProgram } from "./printer.ts";

export type PatchResult = { files: Record<string, string>; changed: string[]; diagnostics: Diagnostic[] };

// `target` is the path; `args` is the rest of the op line (props for `set`, file for `add`).
type Op = { op: string; target: string; args: string; body: string; line: number; bodyLine: number };

const OP_LINE = /^(replace|insert before|insert after|append|remove|set|add)\b[ \t]*(.*)$/;
const PATCH_FILE = "patch";

// ---------- patch text → operations ----------
export function parsePatch(text: string): Op[] {
  const ops: Op[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let cur: (Op & { lines: string[] }) | null = null;
  const flush = () => {
    if (!cur) return;
    while (cur.lines.length && !cur.lines[cur.lines.length - 1].trim()) cur.lines.pop();
    const indent = Math.min(...cur.lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
    cur.body = cur.lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
    const { lines: _, ...op } = cur;
    ops.push(op);
  };
  lines.forEach((raw, i) => {
    const m = OP_LINE.exec(raw);
    if (m) {
      flush();
      const [target = "", ...args] = m[2].trim().split(/\s+/);
      cur = { op: m[1], target, args: args.join(" "), body: "", line: i + 1, bodyLine: i + 2, lines: [] };
    } else if (cur) {
      // Blank lines before the body are skipped; remember where the body really starts.
      if (!cur.lines.length && !raw.trim()) { cur.bodyLine = i + 2; return; }
      if (!raw.trim().startsWith("#") || cur.lines.length) cur.lines.push(raw);
    } else if (raw.trim() && !raw.trim().startsWith("#")) {
      throw new CompileError(diag("PATCH_SYNTAX", `se esperaba una operación, llegó '${raw.trim()}'`, { file: PATCH_FILE, line: i + 1, col: 1 }, {
        expected: "replace|insert before|insert after|append|remove|set|add",
      }));
    }
  });
  flush();
  return ops;
}

// ---------- path resolution ----------
type ViewTarget = { kind: "view"; list: ViewNode[]; i: number; node: ViewNode | null; comp: ComponentDecl };
type Target =
  | { kind: "decl"; i: number; decl: Decl }
  | { kind: "member"; comp: ComponentDecl; i: number }
  | { kind: "field"; model: ModelDecl; i: number }
  | ViewTarget;

const tagOf = (n: ViewNode) => (n.kind === "Element" ? n.tag : n.kind === "IfView" ? "if" : "for");
const childrenOf = (n: ViewNode): ViewNode[] => (n.kind === "Element" ? n.children : n.kind === "IfView" ? n.then : n.body);

// Valid next path segments inside a list, used as fix suggestions.
function segLabels(list: ViewNode[]): string[] {
  return list.map((n) => {
    const tag = tagOf(n);
    const same = list.filter((x) => tagOf(x) === tag);
    return same.length > 1 ? `${tag}[${same.indexOf(n)}]` : tag;
  });
}

function resolve(p: Program, path: string, loc: Loc): Target {
  const fail = (type: "TARGET_NOT_FOUND" | "AMBIGUOUS_TARGET", msg: string, fixes: string[]): never => {
    throw new CompileError(diag(type, msg, loc, { expr: path, fixes }));
  };
  const m = /^([A-Za-z_][\w]*)(?:\.([A-Za-z_]\w*))?(?:\/(.*))?$/.exec(path);
  if (!m) fail("TARGET_NOT_FOUND", `ruta inválida '${path}'`, ["Componente", "Componente.miembro", "Componente/tag/tag[1]"]);
  const [, name, member, rest] = m!;
  const di = p.decls.findIndex((d) => d.name === name);
  if (di < 0) fail("TARGET_NOT_FOUND", `no existe '${name}'`, suggest(name, p.decls.map((d) => d.name)));
  const decl = p.decls[di];

  if (decl.kind === "Api" && (member || rest !== undefined)) fail("TARGET_NOT_FOUND", `${name} es una api: solo se puede reemplazar o borrar entera`, [name]);
  if (member) {
    if (decl.kind === "Model") {
      const i = decl.fields.findIndex((f) => f.name === member);
      if (i < 0) fail("TARGET_NOT_FOUND", `${name} no tiene el campo '${member}'`, suggest(member, decl.fields.map((f) => `${name}.${f.name}`)));
      return { kind: "field", model: decl, i };
    }
    const comp = decl as ComponentDecl;
    const i = comp.members.findIndex((x) => x.name === member);
    if (i < 0) fail("TARGET_NOT_FOUND", `${name} no tiene el miembro '${member}'`, comp.members.map((x) => `${name}.${x.name}`));
    return { kind: "member", comp, i };
  }
  if (rest === undefined) return { kind: "decl", i: di, decl };
  if (decl.kind !== "Component") fail("TARGET_NOT_FOUND", `${name} es un model y no tiene vista`, [`${name}.campo`]);
  const comp = decl as ComponentDecl;

  let list = comp.view;
  let cur: ViewNode | null = null;
  let curList = list, curIndex = -1;
  let walked = name;
  for (const seg of rest!.split("/").filter(Boolean)) {
    if (seg === "else") {
      if (!cur || cur.kind !== "IfView") fail("TARGET_NOT_FOUND", "`else` solo puede seguir a un `if`", []);
      const ifNode: ViewNode & { kind: "IfView" } = cur as ViewNode & { kind: "IfView" };
      ifNode.else ??= [];
      list = ifNode.else;
      cur = null;
      walked += "/else";
      continue;
    }
    if (cur) list = childrenOf(cur);
    const sm = /^([A-Za-z_]\w*)(?:\[(\d+)\])?$/.exec(seg);
    if (!sm) fail("TARGET_NOT_FOUND", `segmento inválido '${seg}'`, segLabels(list).map((l) => `${walked}/${l}`));
    const matches = list.map((n, i) => ({ n, i })).filter((x) => tagOf(x.n) === sm![1]);
    if (!matches.length) {
      const labels = segLabels(list);
      const close = suggest(sm![1], labels);
      fail("TARGET_NOT_FOUND", `no hay '${sm![1]}' dentro de ${walked}`, (close.length ? close : labels).map((l) => `${walked}/${l}`));
    }
    let pick = matches[0];
    if (sm![2] !== undefined) {
      pick = matches[Number(sm![2])];
      if (!pick) fail("TARGET_NOT_FOUND", `${sm![1]}[${sm![2]}] no existe: hay ${matches.length}`, matches.map((_, k) => `${walked}/${sm![1]}[${k}]`));
    } else if (matches.length > 1) {
      fail("AMBIGUOUS_TARGET", `hay ${matches.length} '${sm![1]}' dentro de ${walked}`, matches.map((_, k) => `${walked}/${sm![1]}[${k}]`));
    }
    cur = pick.n;
    curList = list;
    curIndex = pick.i;
    walked += "/" + seg;
  }
  // A path ending in `else` addresses the else branch itself (only valid for append).
  if (cur === null) return { kind: "view", list, i: -1, node: null, comp };
  return { kind: "view", list: curList, i: curIndex, node: cur, comp };
}

// Every addressable view path of a component, for `art context`.
export function viewPaths(comp: ComponentDecl): { path: string; node: ViewNode }[] {
  const out: { path: string; node: ViewNode }[] = [];
  const walk = (list: ViewNode[], prefix: string) => {
    for (const n of list) {
      const tag = tagOf(n);
      const same = list.filter((x) => tagOf(x) === tag);
      const path = `${prefix}/${same.length > 1 ? `${tag}[${same.indexOf(n)}]` : tag}`;
      out.push({ path, node: n });
      walk(childrenOf(n), path);
      if (n.kind === "IfView" && n.else) walk(n.else, path + "/else");
    }
  };
  walk(comp.view, comp.name);
  return out;
}

// ---------- applying operations ----------
function retag<T extends { loc: Loc }>(items: T[], file: string): T[] {
  for (const it of items) it.loc = { ...it.loc, file };
  return items;
}

function applyOp(p: Program, op: Op, firstFile: string) {
  const loc: Loc = { file: PATCH_FILE, line: op.line, col: 1 };
  const bodyLine = op.bodyLine;
  const bodyErr = (msg: string, expected: string): never => {
    throw new CompileError(diag("PATCH_BODY", msg, loc, { expr: op.op + " " + op.target, expected }));
  };
  const needBody = () => { if (!op.body.trim()) bodyErr(`'${op.op}' necesita contenido en las líneas siguientes`, "código ArtScript indentado debajo de la operación"); };

  if (op.op === "add") {
    needBody();
    const file = op.target || firstFile; // `add` takes an optional file name instead of a path
    p.decls.push(...retag(parse(op.body, PATCH_FILE, bodyLine).decls, file));
    return;
  }

  const t = resolve(p, op.target, loc);

  if (op.op === "remove") {
    if (t.kind === "decl") p.decls.splice(t.i, 1);
    else if (t.kind === "member") t.comp.members.splice(t.i, 1);
    else if (t.kind === "field") t.model.fields.splice(t.i, 1);
    else if (t.node) t.list.splice(t.i, 1);
    else bodyErr("no se puede borrar una rama `else` con remove; reemplazá el `if`", "una ruta a un nodo");
    return;
  }

  if (op.op === "set") {
    const el = t.kind === "view" && t.node?.kind === "Element" ? t.node : null;
    if (!el) return bodyErr("`set` solo cambia props de un elemento de la vista", "set Componente/tag prop=valor flag -prop");
    if (!op.args) bodyErr("`set` necesita props en la misma línea", "set Componente/tag gap=6 primary -align");
    return setProps(el, op.args, loc);
  }

  needBody();

  if (t.kind === "decl") {
    const decls = () => retag(parse(op.body, PATCH_FILE, bodyLine).decls, t.decl.loc.file);
    const at = op.op === "insert after" ? t.i + 1 : t.i;
    if (op.op === "replace") p.decls.splice(t.i, 1, ...decls());
    else if (op.op === "insert before" || op.op === "insert after") p.decls.splice(at, 0, ...decls());
    else if (t.decl.kind === "Model") t.decl.fields.push(...parseFields(op.body, PATCH_FILE, bodyLine));
    else if (t.decl.kind === "Api") bodyErr("`append` no aplica a una api", "replace " + t.decl.name);
    else {
      const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
      t.decl.members.push(...body.members);
      t.decl.view.push(...body.view);
    }
    return;
  }

  if (t.kind === "member") {
    const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
    if (body.view.length) bodyErr("se esperaban miembros (state, computed, fn), llegó vista", "state | computed | fn");
    if (op.op === "append") bodyErr("`append` no aplica a un miembro; usá `insert after`", "insert after Componente.miembro");
    const at = op.op === "insert after" ? t.i + 1 : t.i;
    t.comp.members.splice(at, op.op === "replace" ? 1 : 0, ...body.members);
    return;
  }

  if (t.kind === "field") {
    if (op.op === "append") bodyErr("`append` no aplica a un campo; usá `insert after`", "insert after Modelo.campo");
    const fields = parseFields(op.body, PATCH_FILE, bodyLine);
    const at = op.op === "insert after" ? t.i + 1 : t.i;
    t.model.fields.splice(at, op.op === "replace" ? 1 : 0, ...fields);
    return;
  }

  const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
  if (body.members.length) bodyErr("se esperaban elementos de vista; los miembros van con `append Componente`", "elementos de vista");
  if (op.op === "append") {
    (t.node ? childrenOf(t.node) : t.list).push(...body.view);
    return;
  }
  if (!t.node) bodyErr(`'${op.op}' necesita una ruta a un nodo, no a una rama else`, "Componente/tag");
  const at = op.op === "insert after" ? t.i + 1 : t.i;
  t.list.splice(at, op.op === "replace" ? 1 : 0, ...body.view);
}

// `gap=6 primary -align`: set or add props/flags, `-name` removes.
function setProps(el: Element, items: string, loc: Loc) {
  const remove = [...items.matchAll(/(?:^|\s)-([A-Za-z_]\w*)/g)].map((x) => x[1]);
  const rest = items.replace(/(?:^|\s)-[A-Za-z_]\w*/g, " ").trim();
  el.props = el.props.filter((p) => !remove.includes(p.name));
  if (!rest) return;
  // Parse the items as the props of a container element, which takes no content.
  const parsed = (parseComponentBody(`row ${rest}`, PATCH_FILE, loc.line).view[0] as Element).props;
  for (const np of parsed) {
    const i = el.props.findIndex((p) => p.name === np.name);
    if (i >= 0) el.props[i] = np;
    else el.props.push(np);
  }
}

// ---------- entry point ----------
export function applyPatch(sources: Source[], patchText: string): PatchResult {
  const { program, diagnostics } = parseProject(sources);
  if (diagnostics.length) return { files: {}, changed: [], diagnostics };
  const p: Program = structuredClone(program);
  const firstFile = sources[0]?.file ?? "app.art";
  try {
    for (const op of parsePatch(patchText)) applyOp(p, op, firstFile);
  } catch (e) {
    if (e instanceof CompileError) return { files: {}, changed: [], diagnostics: [e.diagnostic] };
    throw e;
  }
  const errs = check(p);
  if (errs.length) return { files: {}, changed: [], diagnostics: errs };

  const files: Record<string, string> = {};
  const changed: string[] = [];
  const names = [...new Set([...sources.map((s) => s.file), ...p.decls.map((d) => d.loc.file)])];
  for (const file of names) {
    const decls = p.decls.filter((d) => d.loc.file === file);
    const out = decls.length ? printProgram({ kind: "Program", decls }) : "";
    const before = sources.find((s) => s.file === file)?.src ?? null;
    files[file] = out;
    if (out === before) continue;
    if (before !== null && /\/\/|\/\*/.test(before)) {
      return { files: {}, changed: [], diagnostics: [diag("PATCH_COMMENTS", `${file} tiene comentarios; el patch los perdería`, { file, line: 1, col: 1 }, { fixes: ["quitar los comentarios del archivo o editarlo a mano"] })] };
    }
    changed.push(file);
  }
  return { files, changed, diagnostics: [] };
}
