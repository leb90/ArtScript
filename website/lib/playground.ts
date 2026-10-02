// The playground: the real ArtScript compiler, bundled into this page, and the compiled app running
// in an iframe beside the editor.
let engine: typeof import("./engine.ts") | null = null;

// The compiler is a separate chunk: only this page downloads it.
export async function loadCompiler() {
  engine ??= await import("./engine.ts");
}

export type Problem = { line: number; col: number; type: string; msg: string; fixes: string };
export type Result = { problems: Problem[]; js: string | null; server: boolean; bytes: number };

// `ready` is there so the caller recompiles once the compiler has loaded.
export function compileApp(src: string, ready: boolean): Result {
  if (!ready || !engine) return { problems: [], js: null, server: false, bytes: 0 };
  const r = engine.compile([{ file: "app.art", src }]);
  return {
    problems: r.diagnostics.map((d) => ({ line: d.loc.line, col: d.loc.col, type: d.type, msg: d.msg, fixes: (d.fixes ?? []).join("  |  ") })),
    js: r.js ?? null,
    server: !!r.server,
    bytes: r.js ? new Blob([r.js]).size : 0,
  };
}

let runtimeUrl = "";
let timer: ReturnType<typeof setTimeout> | undefined;

// Runs the compiled app in a fresh iframe inside `box` (debounced while typing).
export function runApp(box: HTMLElement, js: string, dark: boolean, wait = 250) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (typeof document === "undefined" || !box.isConnected) return; // prerendering, or the page is gone
    runtimeUrl ||= URL.createObjectURL(new Blob([engine!.runtimeSrc], { type: "text/javascript" }));
    const app = URL.createObjectURL(new Blob([js.replace('"./runtime.js"', JSON.stringify(runtimeUrl))], { type: "text/javascript" }));
    const frame = document.createElement("iframe");
    frame.title = "Your app";
    frame.srcdoc = `<!doctype html><html data-theme="${dark ? "dark" : "light"}"><body><div id="app"></div><script type="module">import { start } from "${app}"; start(document.getElementById("app"));<\/script></body></html>`;
    box.replaceChildren(frame);
  }, wait);
}

// Shareable links: the code goes in the URL (base64url of UTF-8).
export function encode(src: string): string {
  const bytes = new TextEncoder().encode(src);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decode(s: string): string | null {
  if (!s) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function shareUrl(src: string): string {
  return `${location.origin}${location.pathname}?code=${encode(src)}`;
}

// Tab inserts two spaces instead of leaving the editor.
export function onEditorKey(event: KeyboardEvent, run: () => void) {
  const t = event.target as HTMLTextAreaElement;
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    run();
  } else if (event.key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = t;
    t.value = value.slice(0, a) + "  " + value.slice(b);
    t.selectionStart = t.selectionEnd = a + 2;
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
