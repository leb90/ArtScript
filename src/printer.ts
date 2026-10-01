// Prints the AST as canonical ArtScript. Basis for `art fmt`, errors and `art context`.
import type { Decl, Element, Expr, Field, Program, Stmt, TypeRef, ViewNode } from "./ast.ts";

const PREC: Record<string, number> = {
  "??": 1, "||": 2, "&&": 3, "==": 4, "!=": 4, "<": 5, ">": 5, "<=": 5, ">=": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7, "**": 8,
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
  return t.name + (t.list ? "[]" : "") + (t.optional ? "?" : "");
}

export function printExpr(e: Expr): string {
  switch (e.kind) {
    case "Num": return String(e.value);
    case "Str": return JSON.stringify(e.value);
    case "Template":
      return "`" + e.quasis.map((q, i) => q.replace(/[`\\]|\$(?=\{)/g, "\\$&") + (i < e.exprs.length ? "${" + printExpr(e.exprs[i]) + "}" : "")).join("") + "`";
    case "Bool": return String(e.value);
    case "Null": return "null";
    case "Ident": return e.name;
    case "Member": return wrap(e.object, 10) + (e.optional ? "?." : ".") + e.prop;
    case "Index": return wrap(e.object, 10) + (e.optional ? "?.[" : "[") + printExpr(e.index) + "]";
    case "Call": return wrap(e.callee, 10) + (e.optional ? "?.(" : "(") + e.args.map(printExpr).join(", ") + ")";
    case "Unary": return (e.op === "typeof" || e.op === "await" ? e.op + " " : e.op) + wrap(e.arg, 9);
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
        if (p.value.kind === "Ident" && p.value.name === p.key) return p.key;
        return `${/^[A-Za-z_$][\w$]*$/.test(p.key) ? p.key : JSON.stringify(p.key)}: ${printExpr(p.value)}`;
      }).join(", ") + " }";
    case "Arrow": {
      const ps = e.params.length === 1 ? e.params[0] : `(${e.params.join(", ")})`;
      const body = Array.isArray(e.body) ? printBlockInline(e.body) : wrapArrowBody(e.body);
      return `${ps} => ${body}`;
    }
    case "Spread": return "..." + printExpr(e.arg);
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
    case "Try": return `try ${printBlockInline(s.body)} catch${s.param ? ` (${s.param})` : ""} ${printBlockInline(s.handler)}`;
    case "Cleanup": return `cleanup ${printBlockInline(s.body)}`;
    case "If": {
      let out = `if ${printExpr(s.cond)} ${printBlockInline(s.then)}`;
      if (s.else) out += ` else ${s.else.length === 1 && s.else[0].kind === "If" ? printStmt(s.else[0]) : printBlockInline(s.else)}`;
      return out;
    }
  }
}

export function printBlockInline(stmts: Stmt[]): string {
  return stmts.length ? `{ ${stmts.map(printStmt).join("; ")} }` : "{}";
}

// ---------- Full program (canonical format) ----------

const IND = "  ";

export function printProgram(p: Program): string {
  return p.decls.map(printDecl).join("\n\n") + "\n";
}

export function printRules(r: Field["rules"]): string {
  if (!r) return "";
  return (r.min !== undefined ? ` min=${r.min}` : "") + (r.max !== undefined ? ` max=${r.max}` : "") + (r.match !== undefined ? ` match=${JSON.stringify(r.match)}` : "") + (r.unique ? " unique" : "") + (r.cascade ? " cascade" : "") + (r.was !== undefined ? ` was=${JSON.stringify(r.was)}` : "") + (r.accept !== undefined ? ` accept=${JSON.stringify(r.accept)}` : "");
}

export function printParams(f: { params: string[]; defaults?: (Expr | null)[] }): string {
  return f.params.map((p, i) => (f.defaults?.[i] ? `${p} = ${printExpr(f.defaults[i]!)}` : p)).join(", ");
}

export function printDecl(d: Decl): string {
  if (d.kind === "Use") return `use ${JSON.stringify(d.source)}${d.default ? ` as ${d.default}` : ""}${d.names.length ? ` { ${d.names.join(", ")} }` : ""}`;
  if (d.kind === "Api") return `api ${d.name}: ${d.model}${d.access === "public" ? "" : " " + d.access}`;
  if (d.kind === "Auth") return `auth ${d.api}`;
  if (d.kind === "ServerFn") return `server fn ${d.name}(${printParams(d)}) {\n${printStmts(d.body, 1).join("\n")}\n}`;
  if (d.kind === "Model") {
    return `model ${d.name} {\n${d.fields.map((f) => `${IND}${f.name}: ${printType(f.type)}${f.default ? ` = ${printExpr(f.default)}` : ""}${printRules(f.rules)}`).join("\n")}\n}`;
  }
  let head = d.page ? `page ${d.name}` : d.layout ? `layout ${d.name}` : `component ${d.name}`;
  if (d.page && d.path) head += ` ${JSON.stringify(d.path)}`;
  if (d.page && d.layoutName) head += ` layout ${d.layoutName}`;
  if (d.params.length) head += `(${d.params.map((p) => `${p.name}: ${printType(p.type)}${p.default ? ` = ${printExpr(p.default)}` : ""}`).join(", ")})`;
  const out: string[] = [];
  for (const m of d.members) {
    if (m.kind === "State") out.push(`${IND}state ${m.name}${m.type ? `: ${printType(m.type)}` : ""} = ${printExpr(m.init)}`);
    else if (m.kind === "Computed") out.push(`${IND}computed ${m.name} = ${printExpr(m.expr)}`);
    else if (m.kind === "Data") out.push(`${IND}data ${m.name} = ${printExpr(m.expr)}`);
    else if (m.kind === "Ref") out.push(`${IND}ref ${m.name}`);
    else if (m.kind === "Mount" || m.kind === "Effect") out.push(`${IND}${m.name} {`, ...printStmts(m.body, 2), `${IND}}`);
    else if (m.kind === "Fn") out.push(`${IND}fn ${m.name}(${printParams(m)}) {`, ...printStmts(m.body, 2), `${IND}}`);
  }
  if (d.members.length && d.view.length) out.push("");
  out.push(...printView(d.view, 1));
  return `${head} {\n${out.join("\n")}\n}`;
}

export function printStmts(stmts: Stmt[], depth: number): string[] {
  const pad = IND.repeat(depth);
  const out: string[] = [];
  for (const s of stmts) {
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
    } else if (s.kind === "Try") {
      out.push(`${pad}try {`, ...printStmts(s.body, depth + 1), `${pad}} catch${s.param ? ` (${s.param})` : ""} {`, ...printStmts(s.handler, depth + 1), `${pad}}`);
    } else out.push(pad + printStmt(s));
  }
  return out;
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
  return out;
}
