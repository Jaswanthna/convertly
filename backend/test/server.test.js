import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/server.js";

let server;
let baseUrl;

test.before(async () => {
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("health endpoint returns status and security headers", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("conversion endpoint converts a valid text upload to Markdown", async () => {
  const form = new FormData();
  form.append("file", new Blob(['print("hello")\n'], { type: "text/x-python" }), "hello.py");
  form.append("target", "md");

  const response = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="hello.md"');
  assert.equal(await response.text(), '```py\nprint("hello")\n```\n');
});

test("conversion endpoint rejects a mismatched file extension and signature", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not a PDF"]), "invalid.pdf");
  form.append("target", "txt");

  const response = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /not a valid PDF/i);
});

test("conversion endpoint rejects missing files", async () => {
  const form = new FormData();
  form.append("target", "md");

  const response = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Choose a file/);
});

test("conversion endpoint rejects non-multipart requests", async () => {
  const response = await fetch(`${baseUrl}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "md" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /multipart form data/);
});

test("conversion endpoint requires an output format", async () => {
  const form = new FormData();
  form.append("file", new Blob(["hello"]), "hello.txt");

  const response = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /output format/);
});

test("conversion endpoint enforces the configured upload-size limit", async () => {
  const limitedServer = createApp({ uploadLimitBytes: 8 }).listen(0);
  await once(limitedServer, "listening");
  const limitedUrl = `http://127.0.0.1:${limitedServer.address().port}`;
  try {
    const form = new FormData();
    form.append("file", new Blob(["123456789"]), "large.txt");
    form.append("target", "md");

    const response = await fetch(`${limitedUrl}/api/convert`, { method: "POST", body: form });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /8 bytes or smaller/);
  } finally {
    await new Promise((resolve, reject) => {
      limitedServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("format endpoint returns advertised PDF targets", async () => {
  const response = await fetch(`${baseUrl}/api/formats?source=pdf`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert(result.formats.some(({ id }) => id === "md"));
});
