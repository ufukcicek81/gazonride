"use strict";
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  if (req.url !== "/") {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok: true, service: "gazonride-voice", protocol: 2 }));
});
const wss = new WebSocket.Server({ server, maxPayload: 96 * 1024 });
const rooms = new Map();
const MAX_MEMBERS = 12;

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(msg)); } catch (err) { console.warn("Voice send failed", err.message); }
  }
}
function leave(ws) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (room) {
    room.delete(ws);
    for (const peer of room) send(peer, { type: "peer-left", id: ws.id });
    if (!room.size) rooms.delete(ws.room);
  }
  ws.room = null;
  ws.id = null;
}
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("error", (err) => console.warn("Voice websocket error", err.message));
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
    if (msg.type === "join") {
      const roomId = typeof msg.room === "string" ? msg.room.trim().toUpperCase() : "";
      const id = typeof msg.id === "string" ? msg.id.trim() : "";
      if (!/^[A-Z0-9_-]{4,32}$/.test(roomId) || !/^rider-[a-z0-9]{5,24}$/.test(id)) {
        send(ws, { type: "error", message: "Geçersiz grup kodu" });
        return;
      }
      leave(ws);
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);
      if (room.size >= MAX_MEMBERS) {
        send(ws, { type: "error", message: "Grup kapasitesi dolu" });
        return;
      }
      ws.room = roomId;
      ws.id = id;
      ws.name = typeof msg.name === "string" ? msg.name.slice(0, 64) : "Sürücü";
      // Existing members hear about the new peer; only the newcomer initiates offers.
      const members = [...room].map((peer) => ({ id: peer.id, name: peer.name }));
      for (const peer of room) send(peer, { type: "peer-joined", id, name: ws.name });
      room.add(ws);
      send(ws, { type: "members", members });
    } else if (msg.type === "signal") {
      if (!ws.room || !msg.data || typeof msg.data !== "object") return;
      if (!["offer", "answer", "ice"].includes(msg.data.kind)) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      for (const peer of room) {
        if (peer.id === msg.to && peer !== ws) {
          send(peer, { type: "signal", from: ws.id, data: msg.data });
          break;
        }
      }
    } else if (msg.type === "leave") {
      ws.close();
    }
  });
  ws.on("close", () => leave(ws));
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { ws.terminate(); }
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));
server.listen(process.env.PORT || 8080, "0.0.0.0", () => console.log("GaZonRide voice signaling ready"));
