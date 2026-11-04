// The starting code and reference apps of the Next.js stack, from React's, so both start from the
// same code: App.tsx (or a task's root component) becomes app/page.tsx with "use client", other
// components go to components/ and plain modules to lib/, the folders a Next project has them in.
// Apps that use routes or a backend have their references written by hand (refs/<task>/next).
//   node benchmarks/eval/gen-next.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const HERE = import.meta.dirname;
const TASKS = join(HERE, "..", "tasks");

function convert(from: string, to: string, root: string) {
  rmSync(to, { recursive: true, force: true });
  const names = readdirSync(from);
  const where = (name: string) => (name === root ? "app/page.tsx" : name.endsWith(".tsx") ? `components/${name}` : `lib/${name}`);
  for (const name of names) {
    let src = readFileSync(join(from, name), "utf8");
    // ./Header → @/components/Header, ./data → @/lib/data.
    src = src.replace(/from "\.\/([\w-]+)"/g, (_m, mod: string) => {
      const file = names.find((n) => n === `${mod}.tsx` || n === `${mod}.ts`);
      return `from "@/${file?.endsWith(".tsx") ? "components" : "lib"}/${mod}"`;
    });
    if (name === root) src = `"use client";\n\n${src}`;
    const path = join(to, where(name));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, src);
  }
}

// The base of the two small modification tasks.
convert(join(TASKS, "counter", "react"), join(TASKS, "counter", "next"), "Counter.tsx");
convert(join(TASKS, "todo", "react"), join(TASKS, "todo", "next"), "Todos.tsx");

// The larger projects.
for (const project of ["shop", "admin", "adminxl"]) convert(join(HERE, "projects", project, "react"), join(HERE, "projects", project, "next"), "App.tsx");

// References without routes or a backend: the same React app, as a page.
for (const task of readdirSync(join(HERE, "refs"))) {
  const react = join(HERE, "refs", task, "react");
  if (!existsSync(react) || readdirSync(react).join() !== "App.tsx") continue;
  if (["routes", "nav-layout", "query-search"].includes(task)) continue;
  convert(react, join(HERE, "refs", task, "next"), "App.tsx");
}
console.log("next bases and references written");
