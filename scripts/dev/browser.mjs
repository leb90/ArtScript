// Drives a real headless Chrome through the DevTools protocol (no dependencies): screenshots,
// clicks and evaluations, to check UI work in a browser.
//   node scripts/dev/browser.mjs steps.json
// steps.json: { "width"?: 1440, "height"?: 900, "dark"?: true, "steps": [
//   { "go": url, "wait"?: ms }, { "click": selector, "wait"?: ms }, { "eval": js },
//   { "shot": file.png, "y"?: scrollY }, { "wait": ms } ] }
// Prints eval results and page exceptions. CHROME env var overrides the Chrome binary.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const steps = JSON.parse(readFileSync(process.argv[2], "utf8"));
const W = steps.width ?? 1440, H = steps.height ?? 900;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9333", `--window-size=${W},${H}`, `--user-data-dir=${join(tmpdir(), "art-cdp-profile")}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch("http://127.0.0.1:9333/json")).json(); } catch { await sleep(100); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map(), logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") logs.push("EXCEPTION " + d.params.exceptionDetails.exception?.description);
  else if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.type + " " + d.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
if (steps.dark) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
for (const s of steps.steps) {
  if (s.go) { await send("Page.navigate", { url: s.go }); await sleep(s.wait ?? 1200); }
  else if (s.eval) {
    const r = await send("Runtime.evaluate", { expression: s.eval, awaitPromise: true, returnByValue: true });
    console.log("eval:", JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description));
  } else if (s.click) { await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(s.click)}).click()` }); await sleep(s.wait ?? 600); }
  else if (s.shot) {
    if (s.y !== undefined) { await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${s.y})` }); await sleep(300); }
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(s.shot, Buffer.from(r.result.data, "base64"));
    console.log("shot", s.shot);
  } else if (s.wait) await sleep(s.wait);
}
if (logs.length) console.log(logs.join("\n"));
ws.close();
chrome.kill();
