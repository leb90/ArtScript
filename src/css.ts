// Scoped styles (`style { ... }` in a component): every selector only matches elements of that
// component, marked with data-s="<Component>". The last compound of each selector gets the
// attribute (before any pseudo-class or pseudo-element), as Vue's scoped styles do.

function scopeSelector(sel: string, attr: string): string {
  const s = sel.trim();
  if (!s) return s;
  // The last compound: after the last combinator (space, >, +, ~) outside brackets and parens.
  let depth = 0, cut = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) cut = i + 1;
  }
  const head = s.slice(0, cut), last = s.slice(cut);
  const pseudo = last.search(/(?<!\\):(?![^(]*\))/);
  return pseudo < 0 ? `${head}${last}${attr}` : `${head}${last.slice(0, pseudo)}${attr}${last.slice(pseudo)}`;
}

// Rewrites the selectors of a stylesheet; @media/@supports blocks are scoped inside, @keyframes and
// @font-face are kept as they are.
export function scopeCss(css: string, component: string): string {
  const attr = `[data-s="${component}"]`;
  let out = "", i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) { out += css.slice(i).trim(); break; }
    const prelude = css.slice(i, open);
    let depth = 1, j = open + 1;
    for (; j < css.length && depth; j++) depth += css[j] === "{" ? 1 : css[j] === "}" ? -1 : 0;
    const body = css.slice(open + 1, j - 1);
    const p = prelude.trim();
    if (/^@(media|supports|container)/.test(p)) out += `${p}{${scopeCss(body, component)}}`;
    else if (p.startsWith("@")) out += `${p}{${body}}`;
    else out += `${p.split(",").map((x) => scopeSelector(x, attr)).join(",")}{${body.trim()}}`;
    i = j;
  }
  return out;
}
