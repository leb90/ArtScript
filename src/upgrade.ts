// The agent instructions `art init` copies into a project (the specs, AGENTS.md, the Claude Code
// skill, the Cursor rule) follow the installed package: `art check` says when a copy is stale and
// `art upgrade` refreshes them. In AGENTS.md only the ArtScript block (between the markers) belongs
// to the package; what a project writes outside it stays.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const START = "<!-- artscript:start";
const END = "<!-- artscript:end -->";

// [path in the project, source in the package]
const FILES: [string, string][] = [
  ["ARTSCRIPT.md", "docs/SPEC.md"],
  ["ARTSCRIPT-CORE.md", "docs/SPEC-CORE.md"],
  ["ARTSCRIPT-EDIT.md", "docs/SPEC-EDIT.md"],
  ["AGENTS.md", "templates/default/AGENTS.md"],
  [".claude/skills/artscript/SKILL.md", "templates/default/.claude/skills/artscript/SKILL.md"],
  [".cursor/rules/artscript.mdc", "templates/default/.cursor/rules/artscript.mdc"],
];

// SHA-256 of every AGENTS.md that `art init` wrote before the managed block (0.2.0 … 0.2.12): a
// project's copy that is one of them has nothing of its own, so it's replaced without a backup.
const PREVIOUS_AGENTS = new Set([
  "0968f113ae7a7db9c805005b1b77207bc8d165958dcb4a7cf191ccf9cca77b82",
  "0c5cbf1cfdf9ae4f9e1468c1ac4a90d347ac0ddccb10857aad9b842471ee7fa9",
  "11c84a363b1018cfbdcf72c7f876696acc6a0561b94445e3fdce693c49879bf6",
  "78047d24ca81869a3542ce475ef5c0799b8d2414a26708710d25bc20a1a92648",
  "8fc974944c23fde8e07a00b3aa0358b72b3560bb4a8a9a5f5fb746134dbf6b2c",
  "aab3327fa1b408a01071cba77011a95dcfb9cf1abe409e69081d95d4cc4d64f7",
  "b9d9500d5904c7c78f0e22d9d875170f10404bdeacea56f21d794b1f303e1fb9",
  "cf32e7cad3bbcd19624ff696d0262a985a3105c6ff7d800b5036e2dc56f19e43",
  "da2b05c892bbf272c74098dce4935a2ffdb4d89ec0f955f07753785dc9e3ddb8",
  "e1273a9577e03805f007e714b9f7c871ba917e212c86a4df70b756b48e8255d1",
  "f96b237913cda79d67e6010cf3025cb74bbf81cbe153e1d0edf061de99df883b",
]);

const read = (f: string) => readFileSync(f, "utf8");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const block = (text: string): string | null => {
  const a = text.indexOf(START), b = text.indexOf(END);
  return a >= 0 && b > a ? text.slice(a, b + END.length) : null;
};

// A project made by `art init` (it has the spec copies).
export const isArtProject = (dir: string) => existsSync(join(dir, "ARTSCRIPT.md")) || existsSync(join(dir, "ARTSCRIPT-CORE.md"));

function fresh(path: string, have: string, want: string): boolean {
  if (path !== "AGENTS.md") return have === want;
  const b = block(have);
  return b === null ? have === want : b === block(want);
}

// The copies that differ from the installed package (missing ones aren't stale: a project may drop one).
export function staleInstructions(dir: string): string[] {
  if (!isArtProject(dir)) return [];
  return FILES.filter(([p, src]) => existsSync(join(dir, p)) && !fresh(p, read(join(dir, p)), read(join(ROOT, src)))).map(([p]) => p);
}

// `notes`: how AGENTS.md was updated, for the message.
export function upgradeInstructions(dir: string): { updated: string[]; added: string[]; setAside: string[]; notes: Record<string, string> } {
  const updated: string[] = [], added: string[] = [], setAside: string[] = [];
  const notes: Record<string, string> = {};
  for (const [p, src] of FILES) {
    const file = join(dir, p);
    const want = read(join(ROOT, src));
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, want);
      added.push(p);
      continue;
    }
    const have = read(file);
    if (fresh(p, have, want)) continue;
    const b = p === "AGENTS.md" ? block(have) : null;
    if (b !== null) {
      writeFileSync(file, have.replace(b, block(want)!));
      notes[p] = "the ArtScript block; your instructions outside it stay";
    } else {
      // AGENTS.md from before the markers: the old one is kept next to it, the project's additions in it.
      if (p === "AGENTS.md" && !PREVIOUS_AGENTS.has(sha256(have))) {
        let aside = `${file}.old`;
        for (let i = 2; existsSync(aside); i++) aside = `${file}.old${i}`;
        renameSync(file, aside);
        setAside.push(relative(dir, aside));
        notes[p] = `the previous one is ${relative(dir, aside)}`;
      } else if (p === "AGENTS.md") notes[p] = "it was an older ArtScript template, unchanged";
      writeFileSync(file, want);
    }
    updated.push(p);
  }
  return { updated, added, setAside, notes };
}
