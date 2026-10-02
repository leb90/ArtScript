import type { Loc } from "./ast.ts";
import { CompileError, diag } from "./errors.ts";

export type TplPart = { src: string; line: number; col: number };

export type Token = {
  t: "id" | "num" | "str" | "tpl" | "op" | "nl" | "eof" | "css";
  v: string;
  loc: Loc;
  quasis?: string[]; // only for `tpl`
  parts?: TplPart[]; // expressions inside ${ } (unparsed source)
};

// Sorted longest first so matching is greedy.
const OPS = [
  "...", "===", "!==", "**=", "??=",
  "=>", "->", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**",
  "+", "-", "*", "/", "%", "<", ">", "=", "!", "?", ":", ".", ",", ";", "(", ")", "[", "]", "{", "}",
];

// A line starting with one of these continues the previous expression (multi-line ternaries,
// method chains, long conditions), as LLMs often write it that way.
const CONTINUATION = /^[ \t\r]*(\?(?!\?)|:|\.(?!\.\.)|&&|\|\||\?\?)/;

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'", "`": "`", $: "$", "0": "\0" };

// Comments are not tokens; when `comments` is given they're collected there (for fmt and patch).
export type Comment = { line: number; text: string };

export function lex(src: string, file: string, startLine = 1, startCol = 1, comments?: Comment[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = startLine;
  let col = startCol;
  // Inside ( ) and [ ] newlines don't end statements.
  const depth: string[] = [];

  const loc = (): Loc => ({ file, line, col });
  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") { line++; col = 1; } else col++;
      i++;
    }
  };

  while (i < src.length) {
    const c = src[i];

    if (c === "\n") {
      const l = loc();
      adv();
      const continues = CONTINUATION.test(src.slice(i));
      if (!continues && (depth.length === 0 || depth[depth.length - 1] === "{")) {
        if (out.length && out[out.length - 1].t !== "nl") out.push({ t: "nl", v: "\n", loc: l });
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") { adv(); continue; }
    if (c === "/" && src[i + 1] === "/") {
      const from = i, at = line;
      while (i < src.length && src[i] !== "\n") adv();
      comments?.push({ line: at, text: src.slice(from, i).trimEnd() });
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const from = i, at = line;
      adv(2);
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) adv();
      adv(2);
      comments?.push({ line: at, text: src.slice(from, i) });
      continue;
    }

    const start = loc();

    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      // `style {` at the start of a line: a CSS block, taken as raw text (a `css` token).
      const prev = out[out.length - 1];
      const brace = /^[ \t]*\{/.exec(src.slice(j));
      if (src.slice(i, j) === "style" && (!prev || prev.t === "nl" || prev.v === "{") && brace) {
        let k = j + brace[0].length, depth = 1;
        for (; k < src.length && depth; k++) depth += src[k] === "{" ? 1 : src[k] === "}" ? -1 : 0;
        out.push({ t: "id", v: "style", loc: start });
        out.push({ t: "css", v: src.slice(j + brace[0].length, k - 1), loc: start });
        adv(k - i);
        continue;
      }
      out.push({ t: "id", v: src.slice(i, j), loc: start });
      adv(j - i);
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(0x[0-9a-fA-F_]+|[0-9_]*\.?[0-9_]+(e[+-]?[0-9]+)?)/.exec(src.slice(i))!;
      out.push({ t: "num", v: m[0].replace(/_/g, ""), loc: start });
      adv(m[0].length);
      continue;
    }

    // A plain string with `${...}` is meant as a template (fmt writes the backticks).
    if ((c === '"' || c === "'") && new RegExp(`^${c}(?:[^${c}\\\\\\n\`]|\\\\.)*\\$\\{[^}\\n]+\\}(?:[^${c}\\\\\\n\`]|\\\\.)*${c}`).test(src.slice(i))) {
      const end = src.indexOf(c, i + 1);
      src = src.slice(0, i) + "`" + src.slice(i + 1, end) + "`" + src.slice(end + 1);
      continue;
    }
    if (c === '"' || c === "'") {
      adv();
      let s = "";
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\n") break;
        if (src[i] === "\\") { adv(); s += ESCAPES[src[i]] ?? src[i]; adv(); continue; }
        s += src[i];
        adv();
      }
      if (src[i] !== c) throw new CompileError(diag("UNTERMINATED_STRING", "unterminated string", start, { fixes: [`add ${c} at the end`] }));
      adv();
      out.push({ t: "str", v: s, loc: start });
      continue;
    }

    if (c === "`") {
      adv();
      const quasis: string[] = [];
      const parts: TplPart[] = [];
      let s = "";
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { adv(); s += ESCAPES[src[i]] ?? src[i]; adv(); continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          adv(2);
          quasis.push(s);
          s = "";
          const pl = line, pc = col;
          let braces = 1;
          let j = i;
          while (j < src.length && braces > 0) {
            if (src[j] === "{") braces++;
            else if (src[j] === "}") braces--;
            if (braces > 0) j++;
          }
          parts.push({ src: src.slice(i, j), line: pl, col: pc });
          adv(j - i + 1);
          continue;
        }
        s += src[i];
        adv();
      }
      if (src[i] !== "`") throw new CompileError(diag("UNTERMINATED_STRING", "unterminated template", start, { fixes: ["add ` at the end"] }));
      adv();
      quasis.push(s);
      out.push({ t: "tpl", v: "`", loc: start, quasis, parts });
      continue;
    }

    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new CompileError(diag("UNEXPECTED_CHAR", `unexpected character '${c}'`, start));
    if (op === "(" || op === "[" || op === "{") depth.push(op);
    if (op === ")" || op === "]" || op === "}") depth.pop();
    out.push({ t: "op", v: op, loc: start });
    adv(op.length);
  }

  out.push({ t: "eof", v: "", loc: loc() });
  return out;
}
