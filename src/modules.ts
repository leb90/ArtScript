// Resolves `use` modules (npm packages or local JS/TS files) and lists their exports, so the
// checker can verify imported names. Uses esbuild's bundler to follow re-exports.
// Node built-ins are loaded lazily so the compiler also bundles for the browser (the playground),
// where `use` imports simply aren't verified.
const builtin = <T>(name: string): T | null => (globalThis as any).process?.getBuiltinModule?.(name) ?? null;
const path = builtin<typeof import("node:path")>("node:path");
const isAbsolute = (p: string) => (path ? path.isAbsolute(p) : p.startsWith("/"));
const dirname = (p: string) => (path ? path.dirname(p) : p.replace(/\/[^/]*$/, "") || "/");
const resolve = (...ps: string[]) => (path ? path.resolve(...ps) : ps.join("/"));

// `exports: null` means they can't be known statically (CommonJS): names aren't checked.
// `missing` is set when the module exists but one of its own imports doesn't resolve.
export type ModuleInfo = { found: false; reason: string; missing?: { source: string; file: string } } | { found: true; exports: string[] | null; hasDefault: boolean };

let esbuild: typeof import("esbuild") | null | undefined;
function loadEsbuild() {
  if (esbuild === undefined) {
    try { esbuild = builtin<typeof import("node:module")>("node:module")!.createRequire(import.meta.url)("esbuild"); } catch { esbuild = null; }
  }
  return esbuild;
}

export const isLocal = (source: string) => source.startsWith(".") || isAbsolute(source);

// The specifier to emit in generated code: local modules become absolute paths (the generated
// code doesn't live next to the source file), packages stay as they are.
export function specifier(source: string, fromFile: string): string {
  return isLocal(source) ? resolve(dirname(resolve(fromFile)), source) : source;
}

// The package name of a bare specifier ("@scope/pkg/sub" → "@scope/pkg").
export function packageName(source: string): string {
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// Each entry remembers the local files esbuild read for it (the module and what it re-exports) and
// their modification times: `art dev` keeps this process alive while those files are edited.
const fs = builtin<typeof import("node:fs")>("node:fs");
const mtime = (f: string) => { try { return fs?.statSync(f).mtimeMs ?? 0; } catch { return -1; } };
const cache = new Map<string, { info: ModuleInfo; files: [string, number][] }>();

export function inspectModule(source: string, fromFile: string): ModuleInfo | null {
  const eb = loadEsbuild();
  if (!eb) return null; // no esbuild: imports aren't verified
  const dir = dirname(resolve(fromFile));
  const key = `${dir}\0${source}`;
  const cached = cache.get(key);
  if (cached && cached.files.every(([f, t]) => mtime(f) === t)) return cached.info;
  // Browser first; Node-only packages (used from server fns) resolve with the Node platform.
  const buildFor = (platform: "browser" | "node", contents: string) =>
    eb.buildSync({
      stdin: { contents, resolveDir: dir, loader: "js" }, bundle: true, write: false, format: "esm",
      platform, metafile: true, outfile: "out.js", logLevel: "silent",
    });
  const build = (contents: string) => {
    try { return buildFor("browser", contents); } catch { return buildFor("node", contents); }
  };
  let info: ModuleInfo;
  let files: [string, number][] = [];
  try {
    const out = build(`export * from ${JSON.stringify(source)};`);
    files = Object.keys(out.metafile!.inputs).filter((f) => f !== "<stdin>" && !/(^|[\\/])node_modules[\\/]/.test(f)).map((f) => [resolve(f), mtime(resolve(f))]);
    const names = Object.values(out.metafile!.outputs)[0].exports;
    let hasDefault = true;
    try { build(`export { default } from ${JSON.stringify(source)};`); } catch { hasDefault = false; }
    // A module with no static named exports is (almost always) CommonJS: names can't be checked.
    info = { found: true, exports: names.length ? names : null, hasDefault };
  } catch (e: any) {
    const err = e?.errors?.[0];
    const text = err?.text ?? String(e);
    info = { found: false, reason: text };
    // The failure is inside the module (a file other than our stdin): report what it couldn't import.
    const inner = err?.location?.file && /Could not resolve "([^"]+)"/.exec(text);
    if (inner) info.missing = { source: inner[1], file: err.location.file };
    // A local file that doesn't resolve yet may exist on the next check.
    if (isLocal(source)) return info;
  }
  cache.set(key, { info, files });
  return info;
}
