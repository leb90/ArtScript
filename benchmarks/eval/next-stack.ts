// Next.js in the eval. A real `next build` validates each answer: its errors (a missing "use client",
// useSearchParams without Suspense, a bad route export, TypeScript) are what an agent would see, and
// cost what they cost. A real `next start` answers the route handlers. The pages are bundled for the
// same simulated browser and the same behavior checks as every other stack, with next-shim.tsx
// standing in for next/link, next/navigation and the router on the client (see app.ts).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import type * as esbuild from "esbuild";

const HERE = import.meta.dirname;
export const NEXT_DIR = join(HERE, "next");
export const NEXT_BIN = join(NEXT_DIR, "node_modules", "next", "dist", "bin", "next");
const BUILDS = join(NEXT_DIR, "builds");

type Files = Record<string, string>;

// What `create-next-app` leaves in a project: the model doesn't write it, as no other stack writes
// its entry point. An answer that brings its own app/layout.tsx replaces this one.
export const SCAFFOLD: Files = {
  "app/layout.tsx": 'import type { ReactNode } from "react";\nimport "./globals.css";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="es">\n      <body>{children}</body>\n    </html>\n  );\n}\n',
  "app/globals.css": "",
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2017", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true,
      module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", incremental: true,
      plugins: [{ name: "next" }], paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
    exclude: ["node_modules"],
  }, null, 2),
  "next.config.mjs": `export default { images: { unoptimized: true }, turbopack: { root: ${JSON.stringify(NEXT_DIR)} }, outputFileTracingRoot: ${JSON.stringify(NEXT_DIR)} };\n`,
};

// Every file of a folder, with paths relative to it ("app/api/notes/[id]/route.ts").
export function readTree(dir: string, at = ""): Files {
  const out: Files = {};
  for (const name of readdirSync(join(dir, at))) {
    const path = at ? `${at}/${name}` : name;
    if (statSync(join(dir, path)).isDirectory()) Object.assign(out, readTree(dir, path));
    else out[path] = readFileSync(join(dir, path), "utf8");
  }
  return out;
}

const withScaffold = (files: Files): Files => ({ ...SCAFFOLD, ...files });
const write = (dir: string, files: Files) => {
  for (const [name, src] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), src);
  }
};
const keyOf = (files: Files) => createHash("sha1").update(JSON.stringify(Object.entries(files).sort())).digest("hex").slice(0, 16);
export const buildDir = (files: Files) => join(BUILDS, keyOf(withScaffold(files)));

// What the model reads back: the build's output, without its progress lines, stack frames or paths
// of this machine. The cause can come before "Error occurred prerendering", so nothing else goes.
const PROGRESS = /^\s*(▲|✓|at |Creating an optimized|Running TypeScript|Finished TypeScript|Linting|We detected TypeScript|Collecting|Generating static|Finalizing|Skipping)/;
function buildErrors(output: string, dir: string): string[] {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "").replaceAll(dir + "/", "").replaceAll(dir, ".").replaceAll(NEXT_DIR + "/", "");
  const text = clean.split("\n").filter((l) => l.trim() && !PROGRESS.test(l)).join("\n");
  return [`next build falló:\n${text.slice(0, 3000)}`];
}

// A real `next build`. The folder stays for `next start` and the behavior check, in another process,
// which finds it by the files' hash. Two runs may share it (the same answer twice), so it goes when
// the whole eval ends (removeAllBuilds), not when one run does.
const running = new Map<string, Promise<string[]>>();
export function nextBuild(files: Files): Promise<string[]> {
  const merged = withScaffold(files);
  const dir = buildDir(files);
  if (existsSync(join(dir, ".next", "BUILD_ID"))) return Promise.resolve([]);
  const going = running.get(dir);
  if (going) return going;
  const job = new Promise<string[]>((resolve) => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    write(dir, merged);
    const child = spawn(process.execPath, [NEXT_BIN, "build"], { cwd: dir, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => { output += d; });
    child.stderr.on("data", (d) => { output += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 240_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      running.delete(dir);
      if (code === 0) return resolve([]);
      const errors = buildErrors(output, dir);
      rmSync(dir, { recursive: true, force: true });
      resolve(errors);
    });
  });
  running.set(dir, job);
  return job;
}

export function validateNext(files: Files): Promise<string[]> {
  if (!Object.keys(files).some((n) => /^app\/(.*\/)?page\.tsx$/.test(n))) return Promise.resolve(["no hay ninguna página: falta app/page.tsx"]);
  return nextBuild(files);
}

export const removeAllBuilds = () => rmSync(BUILDS, { recursive: true, force: true });
export const hasRouteHandlers = (files: Files) => Object.keys(files).some((n) => /^app\/(.*\/)?route\.ts$/.test(n));

// The JavaScript a visitor can download, from the real build (polyfills, for old browsers, apart).
export function nextSize(files: Files): { raw: number; brotli: number } {
  const chunks = join(buildDir(files), ".next", "static", "chunks");
  let raw = 0, brotli = 0;
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".js") && !name.includes("polyfills")) {
        const bytes = readFileSync(path);
        raw += bytes.length;
        brotli += brotliCompressSync(bytes).length;
      }
    }
  };
  if (existsSync(chunks)) walk(chunks);
  return { raw, brotli };
}

// ---------- the pages, for the simulated browser ----------
const IMPORT_SHIM = JSON.stringify(join(HERE, "next-shim.tsx"));

// The routes as the App Router reads them from the folders.
export function nextEntry(files: Files): string {
  const merged = withScaffold(files);
  const names = Object.keys(merged);
  const pages = names.filter((n) => /^app\/(.*\/)?page\.tsx$/.test(n));
  const layouts = names.filter((n) => /^app\/(.*\/)?layout\.tsx$/.test(n));
  const notFound = names.find((n) => n === "app/not-found.tsx");
  const imports: string[] = [`import { start } from ${IMPORT_SHIM};`];
  const id = new Map<string, string>();
  [...pages, ...layouts, ...(notFound ? [notFound] : [])].forEach((n, i) => {
    id.set(n, `C${i}`);
    imports.push(`import C${i} from ${JSON.stringify("./" + n)};`);
  });
  const folder = (n: string) => n.replace(/(^|\/)[^/]+$/, "");
  const chain = (page: string) => layouts.filter((l) => page === l || folder(page) === folder(l) || folder(page).startsWith(folder(l) + "/"))
    .sort((a, b) => a.length - b.length);
  const routes = pages.map((p) => `{ path: ${JSON.stringify(folder(p))}, page: ${id.get(p)}, layouts: [${chain(p).map((l) => `{ key: ${JSON.stringify(l)}, comp: ${id.get(l)} }`).join(", ")}] }`);
  const rootLayouts = chain("app/not-found.tsx").map((l) => `{ key: ${JSON.stringify(l)}, comp: ${id.get(l)} }`);
  return `${imports.join("\n")}\nstart([${routes.join(", ")}], ${notFound ? id.get(notFound) : "null"}, [${rootLayouts.join(", ")}]);\n`;
}

export function writeNextPages(dir: string, files: Files) {
  write(dir, withScaffold(files));
  write(dir, { "entry.tsx": nextEntry(files) });
}

// next/* resolves to the shim, `@/x` to the project's root, as its tsconfig says.
export function nextPlugin(dir: string): esbuild.Plugin {
  const named: Record<string, string> = {
    "next/link": 'export { Link as default } from "shim";',
    "next/image": 'export { Image as default } from "shim";',
    "next/script": 'export { Script as default } from "shim";',
    "next/dynamic": 'export { dynamic as default } from "shim";',
    "next/navigation": 'export { useRouter, usePathname, useSearchParams, useParams, useSelectedLayoutSegment, redirect, permanentRedirect, notFound } from "shim";',
    "next/font/google": 'import { font } from "shim";\nexport const Inter = font, Geist = font, Geist_Mono = font, Roboto = font, Poppins = font, Montserrat = font, Open_Sans = font, Lato = font;',
    "server-only": "",
    "client-only": "",
  };
  return {
    name: "next-stack",
    setup(build) {
      build.onResolve({ filter: /^next-shim-jsx\/jsx-(dev-)?runtime$/ }, () => ({ path: join(HERE, "next-shim-jsx.ts") }));
      build.onResolve({ filter: /^shim$/ }, () => ({ path: join(HERE, "next-shim.tsx") }));
      build.onResolve({ filter: /^(next\/|server-only$|client-only$)/ }, (a) => (a.path in named ? { path: a.path, namespace: "next-shim" } : null));
      build.onLoad({ filter: /.*/, namespace: "next-shim" }, (a) => ({ contents: named[a.path], loader: "js", resolveDir: HERE }));
      build.onResolve({ filter: /^@\// }, async (a) => build.resolve("./" + a.path.slice(2), { resolveDir: dir, kind: a.kind }));
      // CSS doesn't reach a simulated browser; a CSS module still has to give class names.
      build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default new Proxy({}, { get: (_, k) => String(k) });", loader: "js" }));
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    },
  };
}
