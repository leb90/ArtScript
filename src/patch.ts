// `art patch`: structured edits on the AST, so an AI changes a few nodes instead of rewriting files.
//
//   replace Todos/column/row/button[1]      replace a view node, member (Todos.add), field (Todo.title) or declaration
//     button "Add" primary -> add()
//   insert before|after <path>              insert siblings next to the target
//   append <path>                           add children (element / if / else / for), members or view (component), fields (model)
//   remove <path>
//   set <view path> gap=6 muted -align      set props/flags on an element; `-name` removes one
//   set Component onSave: Fn, n: Number = 1  add (or change) component props; `-name` removes one
//   add [file.art]                          add new top-level declarations
//
// Operations apply in order. The whole patch is atomic: if any operation fails or the result
// doesn't typecheck, nothing is written.
import type { ComponentDecl, Decl, Element, Field, Loc, Member, ModelDecl, Program, ViewNode } from "./ast.ts";
import { check } from "./checker.ts";
import { parseProject, type Source } from "./compile.ts";
import { CompileError, diag, suggest, type Diagnostic } from "./errors.ts";
import { parse, parseComponentBody, parseFields, parseParams } from "./parser.ts";
import { printProgram } from "./printer.ts";

export type PatchResult = { files: Record<string, string>; changed: string[]; diagnostics: Diagnostic[] };

// `target` is the path; `args` is the rest of the op line (props for `set`, file for `add`).
type Op = { op: string; target: string; args: string; body: string; line: number; bodyLine: number; sig?: string };

const OP_LINE = /^(replace|insert before|insert after|append|remove|set|add)\b[ \t]*(.*)$/;
const PATCH_FILE = "patch";

// ---------- patch text → operations ----------
export function parsePatch(text: string): Op[] {
  const ops: Op[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let cur: (Op & { lines: string[]; braced?: boolean }) | null = null;
  const flush = () => {
    if (!cur) return;
    while (cur.lines.length && !cur.lines[cur.lines.length - 1].trim()) cur.lines.pop();
    if (cur.braced && cur.lines.length && /^\}\s*$/.test(cur.lines[cur.lines.length - 1])) cur.lines.pop();
    const indent = Math.min(...cur.lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
    cur.body = cur.lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
    const { lines: _, braced: __, ...op } = cur;
    ops.push(op);
  };
  lines.forEach((raw, i) => {
    const m = OP_LINE.exec(raw);
    if (m) {
      flush();
      // `replace X/column {` ... `}`: the body wrapped in braces, as a block.
      const braced = /\s\{$/.test(m[2].trim());
      const [target = "", ...args] = m[2].trim().replace(/\s*\{$/, "").split(/\s+/);
      cur = { op: m[1], target, args: args.join(" "), body: "", line: i + 1, bodyLine: i + 2, lines: [], braced };
    } else if (cur) {
      // Blank lines before the body are skipped; remember where the body really starts.
      if (!cur.lines.length && !raw.trim()) { cur.bodyLine = i + 2; return; }
      if (!raw.trim().startsWith("#") || cur.lines.length) cur.lines.push(raw);
    } else if (raw.trim() && !raw.trim().startsWith("#")) {
      throw new CompileError(diag("PATCH_SYNTAX", `expected an operation, got '${raw.trim()}'`, { file: PATCH_FILE, line: i + 1, col: 1 }, {
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

// Nodes with `tag` reachable from `list` only through control flow (if/else branches, for bodies).
function inside(list: ViewNode[], tag: string): { n: ViewNode; i: number; list: ViewNode[] }[] {
  const out: { n: ViewNode; i: number; list: ViewNode[] }[] = [];
  for (const n of list) {
    const branches = n.kind === "IfView" ? [n.then, n.else ?? []] : n.kind === "ForView" ? [n.body] : [];
    for (const b of branches) {
      b.forEach((c, i) => { if (tagOf(c) === tag) out.push({ n: c, i, list: b }); });
      out.push(...inside(b, tag));
    }
  }
  return out;
}

// Nodes with `tag` anywhere below `list` (through elements too).
function descendants(list: ViewNode[], tag: string): { n: ViewNode; i: number; list: ViewNode[] }[] {
  const out: { n: ViewNode; i: number; list: ViewNode[] }[] = [];
  const walk = (l: ViewNode[]) => l.forEach((n, i) => {
    if (tagOf(n) === tag) out.push({ n, i, list: l });
    walk(childrenOf(n));
    if (n.kind === "IfView" && n.else) walk(n.else);
  });
  list.forEach((n) => { walk(childrenOf(n)); if (n.kind === "IfView" && n.else) walk(n.else); });
  return out;
}

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
  if (!m) fail("TARGET_NOT_FOUND", `invalid path '${path}'`, ["Component", "Component.member", "Component/tag/tag[1]"]);
  const [, name, member, rest] = m!;
  const di = p.decls.findIndex((d) => d.name === name);
  if (di < 0) fail("TARGET_NOT_FOUND", `'${name}' doesn't exist`, suggest(name, p.decls.map((d) => d.name)));
  const decl = p.decls[di];

  if ((decl.kind === "Api" || decl.kind === "Auth" || decl.kind === "ServerFn") && (member || rest !== undefined)) {
    fail("TARGET_NOT_FOUND", `${name} can only be replaced or removed as a whole`, [name]);
  }
  if (member) {
    if (decl.kind === "Model") {
      const i = decl.fields.findIndex((f) => f.name === member);
      if (i < 0) fail("TARGET_NOT_FOUND", `${name} has no field '${member}'`, suggest(member, decl.fields.map((f) => `${name}.${f.name}`)));
      return { kind: "field", model: decl, i };
    }
    const comp = decl as ComponentDecl;
    const i = comp.members.findIndex((x) => x.name === member);
    if (i < 0) fail("TARGET_NOT_FOUND", `${name} has no member '${member}'`, comp.members.map((x) => `${name}.${x.name}`));
    return { kind: "member", comp, i };
  }
  if (rest === undefined) return { kind: "decl", i: di, decl };
  if (decl.kind !== "Component") fail("TARGET_NOT_FOUND", `${name} is a model and has no view`, [`${name}.field`]);
  const comp = decl as ComponentDecl;

  let list = comp.view;
  let cur: ViewNode | null = null;
  let curList = list, curIndex = -1;
  let walked = name;
  for (const seg of rest!.split("/").filter(Boolean)) {
    if (seg === "else") {
      if (!cur || cur.kind !== "IfView") fail("TARGET_NOT_FOUND", "`else` can only follow an `if`", []);
      const ifNode: ViewNode & { kind: "IfView" } = cur as ViewNode & { kind: "IfView" };
      ifNode.else ??= [];
      list = ifNode.else;
      cur = null;
      walked += "/else";
      continue;
    }
    if (cur) list = childrenOf(cur);
    const sm = /^([A-Za-z_]\w*)(?:\[(\d+)\])?$/.exec(seg);
    if (!sm) fail("TARGET_NOT_FOUND", `invalid segment '${seg}'`, segLabels(list).map((l) => `${walked}/${l}`));
    let matches = list.map((n, i) => ({ n, i, list })).filter((x) => tagOf(x.n) === sm![1]);
    // A path may skip `if`/`else`/`for` wrappers (`CartView/column` for `CartView/if/else/column`),
    // or any other nodes (`List/for` for `List/if/else/column/for`), when exactly one node matches.
    if (!matches.length && sm![2] === undefined) {
      const through = inside(list, sm![1]);
      if (through.length === 1) matches = through;
      else if (!through.length) {
        const deep = descendants(list, sm![1]);
        if (deep.length === 1) matches = deep;
      }
    }
    if (!matches.length) {
      const labels = segLabels(list);
      const close = suggest(sm![1], labels);
      fail("TARGET_NOT_FOUND", `no '${sm![1]}' inside ${walked}`, (close.length ? close : labels).map((l) => `${walked}/${l}`));
    }
    let pick = matches[0];
    if (sm![2] !== undefined) {
      pick = matches[Number(sm![2])];
      if (!pick) fail("TARGET_NOT_FOUND", `${sm![1]}[${sm![2]}] doesn't exist: there are ${matches.length}`, matches.map((_, k) => `${walked}/${sm![1]}[${k}]`));
    } else if (matches.length > 1) {
      fail("AMBIGUOUS_TARGET", `there are ${matches.length} '${sm![1]}' inside ${walked}`, matches.map((_, k) => `${walked}/${sm![1]}[${k}]`));
    }
    cur = pick.n;
    curList = pick.list;
    curIndex = pick.i;
    walked += "/" + seg;
  }
  // A path ending in `else` addresses the else branch itself (only valid for append).
  if (cur === null) return { kind: "view", list, i: -1, node: null, comp };
  return { kind: "view", list: curList, i: curIndex, node: cur, comp };
}

// AIs often write members as view paths (`Shop/fn/add`, `Shop/column/state/items`, `Shop/add`) or
// reach a child component through its parent (`Shop/column/Catalog/grid`). On a miss, these
// readings are tried in order; the first that resolves wins.
const MEMBER_KW = new Set(["state", "computed", "fn", "data", "ref", "mount", "effect"]);

function alternatives(p: Program, path: string): string[] {
  const segs = path.split("/").filter(Boolean);
  const root = segs[0]?.split(".")[0];
  const comp = p.decls.find((d): d is ComponentDecl => d.kind === "Component" && d.name === root);
  const out: string[] = [];
  if (comp) {
    const names = new Set(comp.members.map((m) => m.name));
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i], next = segs[i + 1];
      if (MEMBER_KW.has(s) && next && names.has(next)) out.push(`${root}.${next}`);
      else if (MEMBER_KW.has(s) && !next) {
        // `Catalog/computed`: the only member of that kind.
        const ms = comp.members.filter((m) => m.kind.toLowerCase() === s);
        if (ms.length === 1) out.push(`${root}.${ms[0].name}`);
      } else if (!next && names.has(s)) out.push(`${root}.${s}`);
    }
  }
  for (let i = segs.length - 1; i >= 1; i--) {
    const name = segs[i].replace(/\[\d+\]$/, "");
    // Only with a path below it: a component as the last segment is its use in the parent.
    if (i < segs.length - 1 && p.decls.some((d) => d.kind === "Component" && d.name === name)) {
      out.push(`${name}/${segs.slice(i + 1).join("/")}`);
      break;
    }
  }
  return out;
}

function resolveLoose(p: Program, path: string, loc: Loc): Target {
  try {
    return resolve(p, path, loc);
  } catch (e) {
    if (!(e instanceof CompileError)) throw e;
    for (const alt of alternatives(p, path)) {
      try { return resolve(p, alt, loc); } catch { /* next */ }
    }
    // Members addressed like view nodes: point to the `Component.member` form.
    const root = path.split(/[/.]/)[0];
    const comp = p.decls.find((d): d is ComponentDecl => d.kind === "Component" && d.name === root);
    if (comp && path.split("/").some((s) => MEMBER_KW.has(s))) e.diagnostic.fixes = comp.members.map((m) => `${root}.${m.name}`);
    throw e;
  }
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
  const needBody = () => { if (!op.body.trim()) bodyErr(`'${op.op}' needs a body on the following lines`, "ArtScript code indented under the operation"); };

  if (op.op === "add") {
    needBody();
    const file = op.target || firstFile; // `add` takes an optional file name instead of a path
    p.decls.push(...retag(parse(op.body, PATCH_FILE, bodyLine).decls, file));
    return;
  }

  normalize(p, op);
  let t: Target;
  try {
    t = resolveLoose(p, op.target, loc);
  } catch (e) {
    // `insert before Catalog.computed` / `append Catalog/state` with members: the position of members
    // doesn't change their meaning, so an unknown target in that component just adds them to it.
    const root = /^(\w+)/.exec(op.target)?.[1];
    const comp = root && p.decls.find((d): d is ComponentDecl => d.kind === "Component" && d.name === root);
    if (!(e instanceof CompileError) || !comp || !(op.op.startsWith("insert") || op.op === "append") || !op.body.trim()) throw e;
    const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
    if (body.view.length || !body.members.length) throw e;
    addMembers(comp, body.members);
    return;
  }

  if (op.op === "remove") {
    if (t.kind === "decl") p.decls.splice(t.i, 1);
    else if (t.kind === "member") t.comp.members.splice(t.i, 1);
    else if (t.kind === "field") t.model.fields.splice(t.i, 1);
    else if (t.node) t.list.splice(t.i, 1);
    else bodyErr("remove can't delete an `else` branch; replace the `if`", "a path to a node");
    return;
  }

  if (op.op === "set" && t.kind === "decl" && t.decl.kind === "Model") {
    if (!op.args) bodyErr("`set` needs fields on the same line", `set ${t.decl.name} stock: Number`);
    for (const f of parseFields(op.args.split(",").map((x) => x.trim()).join("\n"), PATCH_FILE, loc.line)) {
      const i = t.decl.fields.findIndex((x) => x.name === f.name);
      if (i >= 0) t.decl.fields[i] = f;
      else t.decl.fields.push(f);
    }
    return;
  }

  if (op.op === "set" && t.kind === "decl" && t.decl.kind === "Component") {
    if (!op.args) bodyErr("`set` needs props on the same line", `set ${t.decl.name} onSave: Fn`);
    return setParams(t.decl, op.args, loc);
  }

  if (op.op === "set") {
    const el = t.kind === "view" && t.node?.kind === "Element" ? t.node : null;
    if (!el) return bodyErr("`set` only changes props of a view element", "set Component/tag prop=value flag -prop");
    if (!op.args) bodyErr("`set` needs props on the same line", "set Component/tag gap=6 primary -align");
    return setProps(el, op.args, loc);
  }

  needBody();

  // `replace Catalog` (or `append Catalog`) followed by members and/or view instead of the whole
  // declaration: members replace those with the same name, a view replaces the view.
  // A body that is only the component's first line (`component Row(item: Item, onRemove: Fn) {`):
  // a change of props.
  const header = /^(?:component|page|layout)\s+\w+(?:\s+"[^"]*")?\s*\(([^)]*)\)\s*\{?\s*$/.exec(op.body.trim());
  if (t.kind === "decl" && t.decl.kind === "Component" && header && op.op === "replace") {
    t.decl.params = header[1].trim() ? parseParams(header[1], PATCH_FILE, bodyLine) : [];
    return;
  }
  if (t.kind === "decl" && t.decl.kind === "Component" && op.sig !== undefined) {
    t.decl.params = op.sig.trim() ? parseParams(op.sig, PATCH_FILE, loc.line) : [];
    if (!op.body.trim()) return;
  }
  if (t.kind === "decl" && t.decl.kind === "Component" && !DECL_START.test(op.body.trimStart())) {
    const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
    addMembers(t.decl, body.members);
    if (body.view.length) {
      if (op.op === "replace") t.decl.view = body.view;
      else if (op.op === "append") t.decl.view.push(...body.view);
      else bodyErr(`'${op.op}' next to a component needs whole declarations`, "component Name { ... }");
    }
    return;
  }

  if (t.kind === "decl") {
    const decls = () => retag(parse(op.body, PATCH_FILE, bodyLine).decls, t.decl.loc.file);
    const at = op.op === "insert after" ? t.i + 1 : t.i;
    if (op.op === "replace") p.decls.splice(t.i, 1, ...decls());
    else if (op.op === "insert before" || op.op === "insert after") p.decls.splice(at, 0, ...decls());
    else if (t.decl.kind === "Model") t.decl.fields.push(...parseFields(op.body, PATCH_FILE, bodyLine));
    else if (t.decl.kind !== "Component") bodyErr(`\`append\` doesn't apply to ${t.decl.name}`, "replace " + t.decl.name);
    else {
      const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
      addMembers(t.decl, body.members);
      t.decl.view.push(...body.view);
    }
    return;
  }

  if (t.kind === "member") {
    const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
    if (body.view.length) bodyErr("expected members (state, computed, fn), got view", "state | computed | fn");
    if (op.op === "append") bodyErr("`append` doesn't apply to a member; use `insert after`", "insert after Component.member");
    if (op.op === "replace") t.comp.members.splice(t.i, 1);
    addMembers(t.comp, body.members, op.op === "insert after" ? t.i + 1 : t.i);
    return;
  }

  if (t.kind === "field") {
    if (op.op === "append") bodyErr("`append` doesn't apply to a field; use `insert after`", "insert after Model.field");
    const fields = parseFields(op.body, PATCH_FILE, bodyLine);
    const at = op.op === "insert after" ? t.i + 1 : t.i;
    t.model.fields.splice(at, op.op === "replace" ? 1 : 0, ...fields);
    return;
  }

  const body = parseComponentBody(op.body, PATCH_FILE, bodyLine);
  // Members have no place in the view: inserted next to a view node, they just join the component.
  if (body.members.length) {
    if (op.op === "replace" && !body.view.length) bodyErr("a view node can't be replaced by members; use `append Component` for members", "view elements");
    addMembers(t.comp, body.members);
    if (!body.view.length) return;
  }
  if (op.op === "append") {
    (t.node ? childrenOf(t.node) : t.list).push(...body.view);
    return;
  }
  if (!t.node) bodyErr(`'${op.op}' needs a path to a node, not to an else branch`, "Component/tag");
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

const DECL_START = /^(use|model|api|auth|server|component|page|layout)\b/;

// Adds members; one with the name of an existing member replaces it (models often "add"
// `state shown` to turn `computed shown` into a state).
function addMembers(comp: ComponentDecl, members: Member[], at = comp.members.length) {
  for (const m of members) {
    const i = m.kind === "Mount" || m.kind === "Effect" ? -1 : comp.members.findIndex((x) => x.name === m.name);
    if (i >= 0) comp.members[i] = m;
    else comp.members.splice(at++, 0, m);
  }
}

// Variants LLMs write, rewritten to the canonical form before resolving:
//   `shop.art/Shop/...`             → `Shop/...`
//   `replace Catalog/state query`   → `replace Catalog.query`
//   `set Catalog/computed shown` + body, `set X/row` + body → `replace ...`
function normalize(p: Program, op: Op) {
  op.target = op.target.replace(/^[\w.-]+\.art\//, "").replace(/^(\w+)\.(?:state|computed|fn|data|ref)\.(\w+)$/, "$1.$2");
  // `replace CouponsRow(item: Item, onRemove: Fn)`: the signature written on the operation line.
  const sig = /^(\w+)\((.*)\)\s*\{?$/.exec(`${op.target} ${op.args}`.trim());
  if (sig) {
    op.target = sig[1];
    op.args = "";
    op.sig = sig[2];
  }
  const segs = op.target.split("/");
  const root = segs[0];
  const comp = p.decls.find((d): d is ComponentDecl => d.kind === "Component" && d.name === root);
  if (comp && /^\w+$/.test(op.args) && comp.members.some((m) => m.name === op.args) && (segs.length === 1 || MEMBER_KW.has(segs[segs.length - 1]))) {
    op.target = `${root}.${op.args}`;
    op.args = "";
  }
  if (op.op === "set" && op.body.trim() && (!op.args || /^\w+$/.test(op.args))) {
    op.op = "replace";
    op.args = "";
  }
}

// `onSave: Fn, n: Number = 1 -old`: add or replace component props; `-name` removes one.
function setParams(comp: ComponentDecl, items: string, loc: Loc) {
  const remove = [...items.matchAll(/(?:^|[\s,])-([A-Za-z_]\w*)/g)].map((x) => x[1]);
  const rest = items.replace(/(?:^|[\s,])-[A-Za-z_]\w*/g, " ").trim().replace(/^,|,$/g, "");
  comp.params = comp.params.filter((p) => !remove.includes(p.name));
  if (!rest) return;
  // `item: Item onRemove` (no commas): a new param starts at each `name` followed by `:`, `=`,
  // another name or the end.
  let params: ComponentDecl["params"];
  try {
    params = parseParams(rest, PATCH_FILE, loc.line);
  } catch (e) {
    if (rest.includes(",")) throw e;
    params = parseParams(rest.split(/\s+(?=[A-Za-z_]\w*\s*(?::|$|\s+[A-Za-z_]\w*\s*:))/).join(", "), PATCH_FILE, loc.line);
  }
  for (const np of params) {
    const i = comp.params.findIndex((p) => p.name === np.name);
    if (i >= 0) comp.params[i] = np;
    else comp.params.push(np);
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
    changed.push(file);
  }
  return { files, changed, diagnostics: [] };
}
