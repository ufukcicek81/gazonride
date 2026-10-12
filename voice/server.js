"use strict";
const http = require("http");
const WebSocket = require("ws");

// ---------------------------------------------------------------------------
// ICE servers for riders on mobile networks. Peer-to-peer audio often fails
// behind carrier NAT (4G/5G) without a TURN relay. Credentials are created
// here, short-lived, from environment variables only (never in the repo):
//   Cloudflare Calls TURN:  CF_TURN_KEY_ID + CF_TURN_API_TOKEN
//   Metered.ca:             METERED_DOMAIN + METERED_API_KEY
//   Any TURN server:        TURN_URLS (comma list) + TURN_USERNAME + TURN_CREDENTIAL
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://ufukcicek81.github.io")
  .split(",").map((x) => x.trim()).filter(Boolean);
const STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
let iceCache = { at: 0, servers: null };
async function turnServers() {
  if (iceCache.servers && Date.now() - iceCache.at < 30 * 60 * 1000) return iceCache.servers;
  let servers = [];
  try {
    if (process.env.CF_TURN_KEY_ID && process.env.CF_TURN_API_TOKEN) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.CF_TURN_KEY_ID}/credentials/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CF_TURN_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: 6 * 3600 })
      });
      const j = await r.json();
      const ice = j && j.iceServers;
      servers = Array.isArray(ice) ? ice : ice ? [ice] : [];
    } else if (process.env.METERED_DOMAIN && process.env.METERED_API_KEY) {
      const r = await fetch(`https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(process.env.METERED_API_KEY)}`);
      const j = await r.json();
      servers = Array.isArray(j) ? j : [];
    } else if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      servers = [{ urls: process.env.TURN_URLS.split(",").map((x) => x.trim()), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }];
    }
  } catch (err) {
    console.warn("TURN credentials unavailable", err.message);
  }
  servers = servers.filter((x) => x && x.urls);
  iceCache = { at: Date.now(), servers };
  return servers;
}
function cors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
  }
}
const server = http.createServer(async (req, res) => {
  cors(req, res);
  const url = (req.url || "/").split("?")[0];
  if (url === "/ice") {
    // Only the app's own pages get relay credentials.
    if (!ALLOWED_ORIGINS.includes(req.headers.origin || "")) { res.writeHead(403); return res.end(); }
    const turn = await turnServers();
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ iceServers: STUN.concat(turn), turn: turn.length > 0 }));
  }
  if (url !== "/") {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok: true, service: "gazonride-voice", protocol: 2, turn: !!(process.env.CF_TURN_KEY_ID || process.env.METERED_API_KEY || process.env.TURN_URLS) }));
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
