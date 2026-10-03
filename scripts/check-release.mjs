// Before `npm publish`: the README npm will show must match the version being published, and the
// changelog must have an entry for it. npm keeps the README of each version forever.
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const readme = readFileSync("README.md", "utf8");
const changelog = readFileSync("CHANGELOG.md", "utf8");
const minor = version.replace(/\.\d+$/, "");
const problems = [];
if (!readme.includes(`Status: **${minor}`) && !readme.includes(`Status: **${version}`)) problems.push(`README.md's "Status:" line doesn't mention ${minor} (it must match the version being published)`);
if (/MVP foundation|v0\.1\b/.test(readme)) problems.push("README.md still describes the project as v0.1");
if (!changelog.includes(`## ${version} (`)) problems.push(`CHANGELOG.md has no entry "## ${version} (date)"`);
if (problems.length) {
  console.error("Not publishing:\n- " + problems.join("\n- "));
  process.exit(1);
}
