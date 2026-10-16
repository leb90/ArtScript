// `live` and sessions: when the session changes (sign-up, login, logout), the event stream is opened
// again with the new cookie, so a server that scopes events to the signed-in user keeps working.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { $auth, $live, setApiBase } from "../runtime/runtime.js";
// @ts-ignore: runtime is plain JS
import { createApi } from "../runtime/server.js";

const SRC = "model User {\n  id: ID\n  email: Email unique\n  password: String min=8\n}\n\napi users: User\n\nauth users\n";
const servers: ReturnType<typeof createServer>[] = [];
after(() => { for (const s of servers) { s.closeAllConnections(); s.close(); } });

test("live: the event stream reconnects with the new session after sign-up and logout", async () => {
  const r = compile([{ file: "a.art", src: SRC }]);
  const api = createApi(r.server!, mkdtempSync(join(tmpdir(), "art-live-session-")));
  const streams: string[] = []; // the cookie each /api/_events connection came with
  const server = createServer(async (req, res) => {
    if (req.url === "/api/_events") streams.push(String(req.headers.cookie ?? "").replace(/=.*/, "") || "none");
    if (!(await api(req, res))) res.writeHead(404).end();
  });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  setApiBase(base);

  // A fetch with a cookie jar, as a browser has.
  const nodeFetch = globalThis.fetch;
  let cookie = "";
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const res = await nodeFetch(url, { ...init, headers: { ...(init.headers as object), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(set) ? "" : set.split(";")[0];
    return res;
  }) as typeof fetch;
  const until = async (n: number) => { for (let i = 0; i < 200 && streams.length < n; i++) await new Promise((ok) => setTimeout(ok, 10)); };
  try {
    $live();
    await until(1);
    assert.deepEqual(streams, ["none"]);
    await $auth().signup({ email: "a@x.co", password: "12345678" });
    await until(2);
    assert.equal(streams.length, 2, "a new stream after signing up");
    assert.notEqual(streams[1], "none", "carrying the session cookie");
    await $auth().logout();
    await until(3);
    assert.equal(streams.length, 3, "a new stream after logging out");
  } finally {
    globalThis.fetch = nodeFetch;
  }
});
