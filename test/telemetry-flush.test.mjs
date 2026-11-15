import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";

const FLUSH = path.resolve(import.meta.dirname, "../bin/lazyweb-telemetry-flush");

function startServer() {
  return new Promise((resolve) => {
    const received = [];
    const server = http.createServer((req, res) => {
      received.authorization = req.headers.authorization;
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try { received.push(JSON.parse(body)); } catch (_) {}
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, received, url: `http://127.0.0.1:${server.address().port}/events` }));
  });
}

function setup(consent, n = 1) {
  const home = mkdtempSync(path.join(tmpdir(), "lazyweb-flush-"));
  const analytics = path.join(home, ".lazyweb", "analytics");
  mkdirSync(analytics, { recursive: true });
  const lines = Array.from({ length: n }, (_, i) => JSON.stringify({ v: 1, event: "query", session_id: "s1", turn: i + 1 })).join("\n") + "\n";
  writeFileSync(path.join(analytics, "events.jsonl"), lines);
  if (consent != null) writeFileSync(path.join(home, ".lazyweb", "telemetry-consent"), consent);
  return { home, analytics };
}

function eventCount(analytics) {
  const f = path.join(analytics, "events.jsonl");
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).length : 0;
}

// Async spawn (not spawnSync): the mock server runs in this same process, so blocking
// the event loop would prevent it from ever answering the child's request.
function runFlush(home, analytics, url) {
  return new Promise((resolve) => {
    const child = spawn("node", [FLUSH], {
      env: { ...process.env, HOME: home, LAZYWEB_ANALYTICS_DIR: analytics, LAZYWEB_EVENTS_URL: url },
    });
    child.on("close", (code) => resolve(code));
  });
}

test("uploads events and consumes them (file emptied) when consent is community", async () => {
  const { server, received, url } = await startServer();
  try {
    const { home, analytics } = setup("community", 3);
    const code = await runFlush(home, analytics, url);
    assert.equal(code, 0);
    assert.equal(received.length, 1);
    assert.equal(received[0].events.length, 3);
    assert.equal(eventCount(analytics), 0, "uploaded events must be removed so the file stays bounded");
    rmSync(home, { recursive: true, force: true });
  } finally { server.close(); }
});

test("identifies the account with the email recorded by setup, when there is one", async () => {
  const { server, received, url } = await startServer();
  try {
    const { home, analytics } = setup("community", 1);
    await runFlush(home, analytics, url);
    assert.equal(received.authorization, undefined, "no recorded email means no Authorization header");

    writeFileSync(path.join(analytics, "events.jsonl"), JSON.stringify({ v: 1, event: "query" }) + "\n");
    writeFileSync(path.join(home, ".lazyweb", "email"), "ada@example.com\n");
    await runFlush(home, analytics, url);
    assert.equal(received.authorization, "Bearer ada@example.com");
    rmSync(home, { recursive: true, force: true });
  } finally { server.close(); }
});

test("does NOT upload when consent is off, and leaves events intact", async () => {
  const { server, received, url } = await startServer();
  try {
    const { home, analytics } = setup("off", 2);
    await runFlush(home, analytics, url);
    assert.equal(received.length, 0);
    assert.equal(eventCount(analytics), 2);
    rmSync(home, { recursive: true, force: true });
  } finally { server.close(); }
});

test("does NOT upload when consent is absent", async () => {
  const { server, received, url } = await startServer();
  try {
    const { home, analytics } = setup(null, 1);
    await runFlush(home, analytics, url);
    assert.equal(received.length, 0);
    rmSync(home, { recursive: true, force: true });
  } finally { server.close(); }
});

test("single-flight: a held lock prevents a concurrent flush from uploading", async () => {
  const { server, received, url } = await startServer();
  try {
    const { home, analytics } = setup("community", 1);
    writeFileSync(path.join(analytics, ".flush.lock"), "99999"); // a fresh lock = another flush running
    await runFlush(home, analytics, url);
    assert.equal(received.length, 0, "must not upload while another flush holds the lock");
    assert.equal(eventCount(analytics), 1, "events untouched when lock is held");
    rmSync(home, { recursive: true, force: true });
  } finally { server.close(); }
});

test("failed upload retains events for the next run (no data loss)", async () => {
  // Point at a closed port so the POST is refused; events must NOT be consumed.
  const { home, analytics } = setup("community", 2);
  const code = await runFlush(home, analytics, "http://127.0.0.1:9/events");
  assert.equal(code, 0);
  assert.equal(eventCount(analytics), 2, "events must be retained when the upload fails");
  rmSync(home, { recursive: true, force: true });
});
