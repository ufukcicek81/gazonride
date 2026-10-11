"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const PORT = 18881;
const url = "ws://127.0.0.1:" + PORT;
const server = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
server.stdout.on("data", (d) => { logs += d.toString(); });
server.stderr.on("data", (d) => { logs += d.toString(); });

function waitUntilReady() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 7000;
    (function poll() {
      if (logs.includes("voice signaling ready")) return resolve();
      if (server.exitCode !== null || Date.now() > deadline) return reject(new Error("Server not ready: " + logs));
      setTimeout(poll, 50);
    })();
  });
}
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("Socket timeout")), 4000);
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.once("error", reject);
  });
}
function collect(ws) {
  const received = [];
  const waiting = [];
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    received.push(msg);
    for (const req of [...waiting]) {
      if (req.filter(msg)) {
        waiting.splice(waiting.indexOf(req), 1);
        clearTimeout(req.timer);
        req.resolve(msg);
      }
    }
  });
  return function awaitMessage(filter) {
    const existing = received.find(filter);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const req = { filter, resolve };
      req.timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(req), 1);
        reject(new Error("Expected signaling message not received: " + JSON.stringify(received)));
      }, 4000);
      waiting.push(req);
    });
  };
}
async function run() {
  await waitUntilReady();
  const a = await connect();
  const nextA = collect(a);
  a.send(JSON.stringify({ type: "join", room: "TEST123", id: "rider-testaaa", name: "iPhone" }));
  const first = await nextA(m => m.type === "members");
  assert.equal(first.members.length, 0);

  const b = await connect();
  const nextB = collect(b);
  b.send(JSON.stringify({ type: "join", room: "TEST123", id: "rider-testbbb", name: "Android" }));
  assert.equal((await nextA(m => m.type === "peer-joined")).id, "rider-testbbb");
  assert.equal((await nextB(m => m.type === "members")).members[0].id, "rider-testaaa");

  b.send(JSON.stringify({ type: "signal", to: "rider-testaaa", data: { kind: "offer", sdp: { type: "offer", sdp: "mock" } } }));
  assert.equal((await nextA(m => m.type === "signal" && m.data.kind === "offer")).from, "rider-testbbb");
  a.send(JSON.stringify({ type: "signal", to: "rider-testbbb", data: { kind: "answer", sdp: { type: "answer", sdp: "mock" } } }));
  assert.equal((await nextB(m => m.type === "signal" && m.data.kind === "answer")).from, "rider-testaaa");

  a.send("null");  // Malformed JSON values must not crash the server.
  b.close();
  assert.equal((await nextA(m => m.type === "peer-left")).id, "rider-testbbb");

  await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:" + PORT, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          assert.equal(JSON.parse(data).ok, true);
          resolve();
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
  a.close();
  console.log("PASS: 2-party voice signaling join, offer, answer, leave, malformed packet");
}
run().then(() => server.kill()).catch((err) => {
  console.error(err);
  console.error(logs);
  server.kill();
  process.exitCode = 1;
});
