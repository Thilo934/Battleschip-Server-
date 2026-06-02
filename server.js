const WebSocket = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Battleship OK");
});

const wss = new WebSocket.Server({ server });
const rooms = {};

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(room, obj, exclude) {
  [room.hostWs, room.guestWs].forEach(ws => {
    if (ws && ws !== exclude) send(ws, obj);
  });
}

wss.on("connection", ws => {
  let roomCode = null;
  let role = null;

  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 20000);

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "create": {
        const code = (msg.code || "").toUpperCase();
        if (!code) return;
        if (rooms[code]) { send(ws, { type: "error", text: "Code bereits vergeben" }); return; }
        rooms[code] = {
          code, hostName: msg.name || "Host", guestName: null,
          hostWs: ws, guestWs: null,
          hostReady: false, guestReady: false,
          hostShips: [], guestShips: []
        };
        roomCode = code; role = "host";
        send(ws, { type: "created", code });
        break;
      }
      case "join": {
        const code = (msg.code || "").toUpperCase();
        const r = rooms[code];
        if (!r) { send(ws, { type: "error", text: "Raum nicht gefunden" }); return; }
        if (r.guestWs) { send(ws, { type: "error", text: "Raum ist voll" }); return; }
        r.guestWs = ws; r.guestName = msg.name || "Gast";
        roomCode = code; role = "guest";
        send(ws, { type: "joined", code, hostName: r.hostName, guestName: r.guestName });
        send(r.hostWs, { type: "guest_joined", guestName: r.guestName });
        break;
      }
      case "start_game": {
        const r = rooms[roomCode];
        if (!r || role !== "host") return;
        if (!r.guestWs) { send(ws, { type: "error", text: "Kein Gegner" }); return; }
        r.hostReady = false; r.guestReady = false;
        r.hostShips = []; r.guestShips = [];
        broadcast(r, { type: "game_started" });
        break;
      }
      case "ships_ready": {
        const r = rooms[roomCode];
        if (!r) return;
        if (role === "host") { r.hostReady = true; r.hostShips = msg.ships || []; }
        else { r.guestReady = true; r.guestShips = msg.ships || []; }
        broadcast(r, { type: "player_ready", role }, ws);
        if (r.hostReady && r.guestReady) {
          const first = Math.random() < 0.5 ? "host" : "guest";
          send(r.hostWs, { type: "battle_start", firstTurn: first, enemyShips: r.guestShips });
          send(r.guestWs, { type: "battle_start", firstTurn: first, enemyShips: r.hostShips });
        }
        break;
      }
      case "shot": {
        const r = rooms[roomCode];
        if (!r) return;
        const target = role === "host" ? r.guestWs : r.hostWs;
        send(target, { type: "incoming_shot", row: msg.row, col: msg.col });
        break;
      }
      case "shot_result": {
        const r = rooms[roomCode];
        if (!r) return;
        const shooter = role === "host" ? r.guestWs : r.hostWs;
        send(shooter, { type: "shot_result", row: msg.row, col: msg.col, hit: msg.hit, sunk: msg.sunk, over: msg.over });
        break;
      }
      case "taunt": {
        const r = rooms[roomCode];
        if (!r) return;
        broadcast(r, { type: "taunt", text: msg.text, fromRole: role }, ws);
        break;
      }
      case "play_again": {
        const r = rooms[roomCode];
        if (!r) return;
        broadcast(r, { type: "play_again_request", role }, ws);
        break;
      }
      case "ping":
        send(ws, { type: "pong" });
        break;
    }
  });

  ws.on("close", () => {
    clearInterval(ping);
    if (!roomCode || !rooms[roomCode]) return;
    const r = rooms[roomCode];
    broadcast(r, { type: "opponent_left" }, ws);
    if (role === "host") { delete rooms[roomCode]; }
    else { r.guestWs = null; r.guestName = null; r.guestReady = false; r.guestShips = []; }
  });

  ws.on("error", err => { console.error("WS error:", err.message); clearInterval(ping); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Battleship server on port", PORT));
