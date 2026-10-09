// Prints the AST as canonical ArtScript. Basis for `art fmt`, errors and `art context`.
import type { Commented, Decl, Element, Expr, Field, Program, Stmt, TypeRef, ViewNode } from "./ast.ts";

const PREC: Record<string, number> = {
  "??": 1, "||": 2, "&&": 3, "|": 3.2, "^": 3.4, "&": 3.6, "==": 4, "!=": 4, "<": 5, ">": 5, "<=": 5, ">=": 5, "in": 5, "instanceof": 5, "<<": 5.5, ">>": 5.5, ">>>": 5.5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7, "**": 8,
};

function prec(e: Expr): number {
  switch (e.kind) {
    case "Assign": case "Arrow": return 0;
    case "Cond": return 0.5;
    case "Binary": return PREC[e.op];
    case "Unary": return 9;
    case "Update": return e.prefix ? 9 : 10;
    default: return 11;
  }
}

function wrap(e: Expr, min: number): string {
  const s = printExpr(e);
  return prec(e) < min ? `(${s})` : s;
}

export function printType(t: TypeRef): string {
  return t.name + (t.params ? `(${t.params.map(printType).join(", ")})` : "") + (t.list ? "[]" : "") + (t.optional ? "?" : "");
}

export function printExpr(e: Expr): string {
  switch (e.kind) {
    case "Num": return e.raw ?? String(e.value);
    case "Str": return JSON.stringify(e.value);
    case "Template":
      return "`" + e.quasis.map((q, i) => q.replace(/[`\\]|\$(?=\{)/g, "\\$&") + (i < e.exprs.length ? "${" + printExpr(e.exprs[i]) + "}" : "")).join("") + "`";
    case "Bool": return String(e.value);
    case "Null": return "null";
    case "Ident": return e.name;
    case "Member": return wrap(e.object, 10) + (e.optional ? "?." : ".") + e.prop;
    case "Index": return wrap(e.object, 10) + (e.optional ? "?.[" : "[") + printExpr(e.index) + "]";
    case "Call": return wrap(e.callee, 10) + (e.optional ? "?.(" : "(") + e.args.map(printExpr).join(", ") + ")";
    case "Unary": return (e.op === "typeof" || e.op === "await" || e.op === "new" ? e.op + " " : e.op) + wrap(e.arg, 9);
    case "Update": return e.prefix ? e.op + wrap(e.arg, 10) : wrap(e.arg, 10) + e.op;
    case "Binary": {
      const p = PREC[e.op];
      const right = e.op === "**" ? wrap(e.right, p) : wrap(e.right, p + 1);
      return `${wrap(e.left, e.op === "**" ? p + 1 : p)} ${e.op} ${right}`;
    }
    case "Cond": return `${wrap(e.test, 1)} ? ${printExpr(e.then)} : ${printExpr(e.else)}`;
    case "Assign": return `${printExpr(e.target)} ${e.op} ${printExpr(e.value)}`;
    case "Array": return "[" + e.items.map(printExpr).join(", ") + "]";
    case "Object":
      if (!e.props.length) return "{}";
      return "{ " + e.props.map((p) => {
        if ("spread" in p) return "..." + printExpr(p.spread);
        if ("computed" in p) return `[${printExpr(p.computed)}]: ${printExpr(p.value)}`;
        if (p.value.kind === "Ident" && p.value.name === p.key) return p.key;
        return `${/^[A-Za-z_$][\w$]*$/.test(p.key) ? p.key : JSON.stringify(p.key)}: ${printExpr(p.value)}`;
      }).join(", ") + " }";
    case "Arrow": {
      const ps = e.params.length === 1 ? e.params[0] : `(${e.params.join(", ")})`;
      const body = Array.isArray(e.body) ? printBlockInline(e.body) : wrapArrowBody(e.body);
      return `${ps} => ${body}`;
    }
    case "Spread": return "..." + printExpr(e.arg);
    case "Regex": return e.source;
  }
}

function wrapArrowBody(e: Expr): string {
  const s = printExpr(e);
  return e.kind === "Object" ? `(${s})` : s;
}

export function printStmt(s: Stmt): string {
  switch (s.kind) {
    case "ExprStmt": return printExpr(s.expr);
    case "Let": return `let ${s.name} = ${printExpr(s.init)}`;
    case "Return": return s.value ? `return ${printExpr(s.value)}` : "return";
    case "Try": return `try ${printBlockInline(s.body)}${s.rethrow ? "" : ` catch${s.param ? ` (${s.param})` : ""} ${printBlockInline(s.handler)}`}${s.finally ? ` finally ${printBlockInline(s.finally)}` : ""}`;
    case "While": return `while ${printExpr(s.cond)} ${printBlockInline(s.body)}`;
    case "Break": return "break";
    case "Continue": return "continue";
    case "Cleanup": return `cleanup ${printBlockInline(s.body)}`;
    case "Loop": return `for (let ${s.name} = ${printExpr(s.init)}; ${printExpr(s.cond)}; ${printExpr(s.update)}) ${printBlockInline(s.body)}`;
    case "For": return `for ${s.item}${s.index ? `, ${s.index}` : ""} in ${printExpr(s.list)} ${printBlockInline(s.body)}`;
    case "If": {
      let out = `if ${printExpr(s.cond)} ${printBlockInline(s.then)}`;
      if (s.else) out += ` else ${s.else.length === 1 && s.else[0].kind === "If" ? printStmt(s.else[0]) : printBlockInline(s.else)}`;
      return out;
    }
  }
}

// An expression that starts a line breaks over several when its one-line form is longer than
// WIDTH: objects and arrays one entry per line, an arrow's block one statement per line, a call
// whose last argument is one of those with that argument broken. The first line has no padding
// (it continues the caller's line); the others are padded for `depth`.
const WIDTH = 100;
// An arrow whose block has several statements (or a control statement) always breaks.
const multi = (e: Expr): boolean => e.kind === "Arrow" && Array.isArray(e.body) && (e.body.length > 1 || e.body.some((s) => s.kind !== "ExprStmt" && s.kind !== "Return"));
export function printExprLines(e: Expr, depth: number): string[] {
  const one = printExpr(e);
  const pad = IND.repeat(depth);
  const breaks = multi(e) || (e.kind === "Call" && e.args.length > 0 && multi(e.args[e.args.length - 1])) || (e.kind === "Assign" && multi(e.value));
  if (!breaks && pad.length + one.length <= WIDTH) return [one];
  const inner = IND.repeat(depth + 1);
  const entries = (items: string[][]) => items.flatMap((ls, i) => ls.map((l, j) => (j === 0 ? inner + l : l) + (j === ls.length - 1 && i < items.length - 1 ? "," : "")));
  if (e.kind === "Object" && e.props.length) {
    const props = e.props.map((p) => {
      if ("spread" in p) return ["..." + printExpr(p.spread)];
      const key = "computed" in p ? `[${printExpr(p.computed)}]` : /^[A-Za-z_$][\w$]*$/.test(p.key) ? p.key : JSON.stringify(p.key);
      if (!("computed" in p) && p.value.kind === "Ident" && p.value.name === p.key) return [key];
      const [first, ...rest] = printExprLines(p.value, depth + 1);
      return [`${key}: ${first}`, ...rest];
    });
    return ["{", ...entries(props), pad + "}"];
  }
  if (e.kind === "Array" && e.items.length) {
    // A list of plain values (words, numbers) fills each line; anything else goes one item per line.
    if (e.items.every((it) => ["Num", "Str", "Bool", "Null", "Ident"].includes(it.kind))) {
      const lines: string[] = [];
      for (const it of e.items.map(printExpr)) {
        const last = lines[lines.length - 1];
        if (last !== undefined && last.length + 1 + it.length + 1 <= WIDTH) lines[lines.length - 1] = `${last} ${it},`;
        else lines.push(`${inner}${it},`);
      }
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
      return ["[", ...lines, pad + "]"];
    }
    return ["[", ...entries(e.items.map((it) => printExprLines(it, depth + 1))), pad + "]"];
  }
  if (e.kind === "Arrow") {
    const ps = e.params.length === 1 ? e.params[0] : `(${e.params.join(", ")})`;
    if (Array.isArray(e.body)) return [`${ps} => {`, ...printStmts(e.body, depth + 1), pad + "}"];
    const [first, ...rest] = printExprLines(e.body, depth);
    return e.body.kind === "Object" ? [`${ps} => (${first}`, ...rest.slice(0, -1), rest.at(-1) + ")"] : [`${ps} => ${first}`, ...rest];
  }
  if (e.kind === "Call" && e.args.length) {
    const last = e.args[e.args.length - 1];
    if (last.kind === "Object" || last.kind === "Array" || last.kind === "Arrow") {
      const head = wrap(e.callee, 10) + (e.optional ? "?.(" : "(") + e.args.slice(0, -1).map((a) => printExpr(a) + ", ").join("");
      const [first, ...rest] = printExprLines(last, depth);
      if (rest.length) return [head + first, ...rest.slice(0, -1), rest.at(-1) + ")"];
    }
  }
  if (e.kind === "Assign") {
    const [first, ...rest] = printExprLines(e.value, depth);
    return [`${printExpr(e.target)} ${e.op} ${first}`, ...rest];
  }
  return [one];
}
// A statement's lines when it starts a line of its own (see printExprLines).
function printStmtLines(s: Stmt, depth: number): string[] {
  const at = (head: string, e: Expr) => { const [first, ...rest] = printExprLines(e, depth); return [head + first, ...rest]; };
  if (s.kind === "ExprStmt") return at("", s.expr);
  if (s.kind === "Let") return at(`let ${s.name} = `, s.init);
  if (s.kind === "Return" && s.value) return at("return ", s.value);
  return [printStmt(s)];
}

export function printBlockInline(stmts: Stmt[]): string {
  return stmts.length ? `{ ${stmts.map(printStmt).join("; ")} }` : "{}";
}

// ---------- Full program (canonical format) ----------

const IND = "  ";

export function printProgram(p: Program): string {
  const decls = p.decls.map((d) => [...before(d, ""), printDecl(d), ...after(d, "")].join("\n"));
  return [...decls, ...(p.comments ? [p.comments.join("\n")] : [])].join("\n\n") + "\n";
}

// A node's comments, each line at the node's indentation (a block comment keeps its inner lines).
const commentLines = (c: string[] | undefined, pad: string) => (c ?? []).map((t) => pad + t);
const before = (n: object, pad: string) => commentLines((n as Commented).comments, pad);
const after = (n: object, pad: string) => commentLines((n as Commented).after, pad);
// `lines` of a node, wrapped in its comments.
const withComments = (n: object, pad: string, lines: string[]) => [...before(n, pad), ...lines, ...after(n, pad)];

export function printRules(r: Field["rules"]): string {
  if (!r) return "";
  return (r.min !== undefined ? ` min=${r.min}` : "") + (r.max !== undefined ? ` max=${r.max}` : "") + (r.match !== undefined ? ` match=${JSON.stringify(r.match)}` : "") + (r.unique ? " unique" : "") + (r.cascade ? " cascade" : "") + (r.was !== undefined ? ` was=${JSON.stringify(r.was)}` : "") + (r.accept !== undefined ? ` accept=${JSON.stringify(r.accept)}` : "");
}

// A style block's CSS, re-indented: its own relative indentation is kept.
function cssLines(css: string, pad: string): string[] {
  const lines = css.split("\n").filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  return lines.map((l) => (l.trim() ? pad + l.slice(indent).trimEnd() : ""));
}

export function printParams(f: { params: string[]; defaults?: (Expr | null)[] }): string {
  return f.params.map((p, i) => (f.defaults?.[i] ? `${p} = ${printExpr(f.defaults[i]!)}` : p)).join(", ");
}

export function printDecl(d: Decl): string {
  // A shared member prints as it would inside a component, without the indentation.
  if (d.kind === "Shared") {
    const host: Decl = { kind: "Component", page: false, name: "X", path: null, params: [], members: [d.member], view: [], loc: d.loc };
    return printDecl(host).split("\n").slice(1, -1).map((l) => l.slice(IND.length)).join("\n");
  }
  if (d.kind === "Use") return `use ${JSON.stringify(d.source)}${d.default ? ` as ${d.default}` : ""}${d.names.length ? ` { ${d.names.map((n) => (d.renames?.[n] ? `${d.renames[n]} as ${n}` : n)).join(", ")} }` : ""}`;
  if (d.kind === "Api") return `api ${d.name}: ${d.model}${d.access === "public" ? "" : " " + d.access}${d.readonly ? " readonly" : ""}`;
  if (d.kind === "Auth") return `auth ${d.api}${d.providers ? ` with ${d.providers.join(", ")}` : ""}`;
  if (d.kind === "Test") {
    const step = (s: Stmt) => s.kind === "ExprStmt" && s.expr.kind === "Call" ? `${printExpr(s.expr.callee)} ${s.expr.args.map(printExpr).join(" ")}`.trimEnd() : printStmt(s);
    return `test ${JSON.stringify(d.description)} {\n${d.body.map((s) => `${IND}${step(s)}`).join("\n")}\n}`;
  }
  if (d.kind === "ServerFn" && d.every) return `server job ${d.name} every ${JSON.stringify(d.every)} {\n${printStmts(d.body, 1).join("\n")}\n}`;
  if (d.kind === "ServerFn") return `server fn ${d.name}(${printParams(d)}) {\n${printStmts(d.body, 1).join("\n")}\n}`;
  if (d.kind === "Model") {
    return `model ${d.name} {\n${d.fields.flatMap((f) => withComments(f, IND, [`${IND}${f.name}: ${printType(f.type)}${f.default ? ` = ${printExpr(f.default)}` : ""}${printRules(f.rules)}`])).join("\n")}\n}`;
  }
  let head = d.page ? `page ${d.name}` : d.layout ? `layout ${d.name}` : `component ${d.name}`;
  if (d.page && d.path) head += ` ${JSON.stringify(d.path)}`;
  if ((d.page || d.layout) && d.layoutName) head += ` layout ${d.layoutName}`;
  if (d.page && d.requires) head += ` requires ${d.requires}`;
  if (d.params.length) head += `(${d.params.map((p) => `${p.name}: ${printType(p.type)}${p.default ? ` = ${printExpr(p.default)}` : ""}`).join(", ")})`;
  const out: string[] = [];
  for (const m of d.members) {
    const lines: string[] = [];
    const init = (head: string, e: Expr, tail = "") => { const [first, ...rest] = printExprLines(e, 1); lines.push(IND + head + first + (rest.length ? "" : tail), ...(rest.length ? [...rest.slice(0, -1), rest.at(-1) + tail] : [])); };
    if (m.kind === "State") init(`state ${m.name}${m.type ? `: ${printType(m.type)}` : ""} = `, m.init);
    else if (m.kind === "Computed") init(`computed ${m.name} = `, m.expr);
    else if (m.kind === "Data") init(`data ${m.name} = `, m.expr, m.live ? " live" : "");
    else if (m.kind === "Ref") lines.push(`${IND}ref ${m.name}`);
    else if (m.kind === "Mount" || m.kind === "Effect") lines.push(`${IND}${m.name} {`, ...printStmts(m.body, 2), `${IND}}`);
    else if (m.kind === "Fn") lines.push(`${IND}fn ${m.name}(${printParams(m)}) {`, ...printStmts(m.body, 2), `${IND}}`);
    else if (m.kind === "Style") lines.push(`${IND}style {`, ...cssLines(m.css, IND.repeat(2)), `${IND}}`);
    out.push(...withComments(m, IND, lines));
  }
  if (d.members.length && d.view.length) out.push("");
  out.push(...printView(d.view, 1));
  return `${head} {\n${out.join("\n")}\n}`;
}

export function printStmts(stmts: Stmt[], depth: number): string[] {
  const pad = IND.repeat(depth);
  const out: string[] = [];
  for (const s of stmts) {
    const start = out.length;
    printStmt1(s, depth, pad, out);
    out.splice(start, 0, ...before(s, pad));
    out.push(...after(s, pad));
  }
  return out;
}

function printStmt1(s: Stmt, depth: number, pad: string, out: string[]) {
  {
    if (s.kind === "If") {
      out.push(`${pad}if ${printExpr(s.cond)} {`, ...printStmts(s.then, depth + 1));
      // `else if` chains stay flat instead of nesting one level per branch.
      let els = s.else;
      while (els && els.length === 1 && els[0].kind === "If") {
        const e: Stmt & { kind: "If" } = els[0];
        out.push(`${pad}} else if ${printExpr(e.cond)} {`, ...printStmts(e.then, depth + 1));
        els = e.else;
      }
      if (els) out.push(`${pad}} else {`, ...printStmts(els, depth + 1));
      out.push(`${pad}}`);
    } else if (s.kind === "Cleanup") {
      out.push(`${pad}cleanup {`, ...printStmts(s.body, depth + 1), `${pad}}`);
    } else if (s.kind === "Loop") {
      out.push(`${pad}for (let ${s.name} = ${printExpr(s.init)}; ${printExpr(s.cond)}; ${printExpr(s.update)}) {`, ...printStmts(s.body, depth + 1), `${pad}}`);
    } else if (s.kind === "For") {
      out.push(`${pad}for ${s.item}${s.index ? `, ${s.index}` : ""} in ${printExpr(s.list)} {`, ...printStmts(s.body, depth + 1), `${pad}}`);
    } else if (s.kind === "While") {
      out.push(`${pad}while ${printExpr(s.cond)} {`, ...printStmts(s.body, depth + 1), `${pad}}`);
    } else if (s.kind === "Try") {
      out.push(`${pad}try {`, ...printStmts(s.body, depth + 1));
      if (!s.rethrow) out.push(`${pad}} catch${s.param ? ` (${s.param})` : ""} {`, ...printStmts(s.handler, depth + 1));
      if (s.finally) out.push(`${pad}} finally {`, ...printStmts(s.finally, depth + 1));
      out.push(`${pad}}`);
    } else {
      const [first, ...rest] = printStmtLines(s, depth);
      out.push(pad + first, ...rest);
    }
  }
}

function propValue(e: Expr): string {
  const s = printExpr(e);
  return prec(e) >= 9 ? s : `(${s})`;
}

export function printElementHead(el: Element): string {
  let s = el.tag;
  if (el.content) s += " " + (prec(el.content) >= 0.5 ? printExpr(el.content) : `(${printExpr(el.content)})`);
  for (const p of el.props) s += " " + (p.value ? `${p.name}=${propValue(p.value)}` : p.name);
  return s;
}

export function printView(nodes: ViewNode[], depth: number): string[] {
  const pad = IND.repeat(depth);
  const out: string[] = [];
  for (const n of nodes) {
    const start = out.length;
    printNode(n, depth, pad, out);
    out.splice(start, 0, ...before(n, pad));
    out.push(...after(n, pad));
  }
  return out;
}

function printNode(n: ViewNode, depth: number, pad: string, out: string[]) {
  {
    if (n.kind === "IfView") {
      out.push(`${pad}if ${printExpr(n.cond)} {`, ...printView(n.then, depth + 1));
      let els = n.else;
      while (els && els.length === 1 && els[0].kind === "IfView") {
        const e: ViewNode & { kind: "IfView" } = els[0];
        out.push(`${pad}} else if ${printExpr(e.cond)} {`, ...printView(e.then, depth + 1));
        els = e.else;
      }
      if (els) out.push(`${pad}} else {`, ...printView(els, depth + 1));
      out.push(`${pad}}`);
    } else if (n.kind === "ForView") {
      out.push(`${pad}for ${n.item}${n.index ? `, ${n.index}` : ""} in ${printExpr(n.list)}${n.key ? ` key ${printExpr(n.key)}` : ""} {`, ...printView(n.body, depth + 1), `${pad}}`);
    } else {
      let line = pad + printElementHead(n);
      const lines: string[] = [];
      if (n.action) {
        if (n.action.length === 1 && n.action[0].kind !== "If") line += " -> " + printStmt(n.action[0]);
        else { lines.push(line + " -> {", ...printStmts(n.action, depth + 1)); line = pad + "}"; }
      }
      if (n.children.length) {
        lines.push(line + " {", ...printView(n.children, depth + 1));
        line = pad + "}";
      }
      lines.push(line);
      out.push(...lines);
    }
  }
}
