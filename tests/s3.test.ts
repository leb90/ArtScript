// S3-compatible storage for uploads: SigV4 against AWS's documented example, and a fake bucket.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compile } from "../src/compile.ts";
// @ts-ignore: runtime is plain JS
import { createApi, signV4 } from "../runtime/server.js";

test("SigV4: AWS's example (GET Object with a Range header)", () => {
  const auth = signV4({
    method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt", region: "us-east-1",
    key: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "x-amz-date": "20130524T000000Z" },
  });
  assert.equal(auth, "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
});

const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

test("uploads go to the bucket, signed, and are served through the api", async () => {
  const objects = new Map<string, Buffer>();
  const bucket = createServer(async (req, res) => {
    if (!String(req.headers.authorization).startsWith("AWS4-HMAC-SHA256 Credential=KEY/")) return res.writeHead(403).end();
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      objects.set(req.url!, Buffer.concat(chunks));
      return res.writeHead(200).end();
    }
    const o = objects.get(req.url!);
    return o ? res.writeHead(200).end(o) : res.writeHead(404).end();
  });
  servers.push(bucket);
  await new Promise<void>((ok) => bucket.listen(0, ok));
  Object.assign(process.env, { ART_S3_BUCKET: "b", ART_S3_KEY: "KEY", ART_S3_SECRET: "SECRET", ART_S3_ENDPOINT: `http://localhost:${(bucket.address() as AddressInfo).port}` });
  try {
    const api = createApi(compile([{ file: "a.art", src: "model P {\n  id: ID\n  photo: File\n}\n\napi ps: P\n" }]).server!, mkdtempSync(join(tmpdir(), "art-s3-")));
    const server = createServer(async (req, res) => { if (!(await api(req, res))) res.writeHead(404).end(); });
    servers.push(server);
    await new Promise<void>((ok) => server.listen(0, ok));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const up = await (await fetch(`${base}/api/_files`, { method: "POST", headers: { "content-type": "image/png", "x-file-name": "a.png" }, body: "png!" })).json();
    assert.equal([...objects.keys()][0], `/b/uploads/${up.url.split("/").pop()}`);
    const got = await fetch(base + up.url);
    assert.equal(got.headers.get("content-type"), "image/png");
    assert.equal(await got.text(), "png!");
  } finally {
    for (const k of ["ART_S3_BUCKET", "ART_S3_KEY", "ART_S3_SECRET", "ART_S3_ENDPOINT"]) delete process.env[k];
  }
});
