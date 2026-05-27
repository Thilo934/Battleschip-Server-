const WebSocket = require("ws");
const http      = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200); res.end("Battleship Server running");
});

const wss = new WebSocket.Server({ server });

// rooms: code -> { host, guest, hostWs, guestWs }
const rooms = {};

function broadcast(room, msg, excludeWs = null) {
  const json = JSON.stringify(msg);
  [room.hostWs, room.guestWs].forEach(ws => {
    if (ws && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  });
}

wss.on("connection", ws => {
  let playerRoom = null;
  let playerRole = null; // "host" | "guest"

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ── Raum erstellen ──────────────────────────────────────
      case "create": {
        const code = msg.code.toUpperCase();
        if (rooms[code]) { ws.send(JSON.stringify({ type: "error", text: "Code bereits vergeben" })); return; }
        rooms[code] = { code, hostName: msg.name, guestName: null, hostWs: ws, guestWs: null, started: false };
        playerRoom = code; playerRole = "host";
        ws.send(JSON.stringify({ type: "created", code }));
        console.log(`Room created: ${code}`);
        break;
      }

      // ── Raum beitreten ──────────────────────────────────────
      case "join": {
        const code = msg.code.toUpperCase();
        const room = rooms[code];
        if (!room)          { ws.send(JSON.stringify({ type: "error", text: "Raum nicht gefunden" })); return; }
        if (room.guestWs)   { ws.send(JSON.stringify({ type: "error", text: "Raum ist voll" })); return; }
        if (room.started)   { ws.send(JSON.stringify({ type: "error", text: "Spiel läuft bereits" })); return; }
        room.guestWs   = ws;
        room.guestName = msg.name;
        playerRoom = code; playerRole = "guest";
        // Beide informieren
        ws.send(JSON.stringify({ type: "joined", code, hostName: room.hostName, guestName: msg.name }));
        room.hostWs.send(JSON.stringify({ type: "guest_joined", guestName: msg.name }));
        console.log(`${msg.name} joined room: ${code}`);
        break;
      }

      // ── Host startet das Spiel ───────────────────────────────
      case "start_game": {
        const room = rooms[playerRoom];
        if (!room || playerRole !== "host") return;
        if (!room.guestWs) { ws.send(JSON.stringify({ type: "error", text: "Noch kein Gegner in der Lobby" })); return; }
        room.started = true;
        broadcast(room, { type: "game_started" });
        console.log(`Game started in room: ${playerRoom}`);
        break;
      }

      // ── Schiffe bestätigt ───────────────────────────────────
      case "ships_ready": {
        const room = rooms[playerRoom];
        if (!room) return;
        if (playerRole === "host") room.hostReady = true;
        else                       room.guestReady = true;
        broadcast(room, { type: "player_ready", role: playerRole }, ws);
        // Beide bereit → Auslosen wer beginnt
        if (room.hostReady && room.guestReady) {
          const first = Math.random() < 0.5 ? "host" : "guest";
          room.currentTurn = first;
          broadcast(room, { type: "battle_start", firstTurn: first });
          console.log(`Battle started in ${playerRoom}, first: ${first}`);
        }
        break;
      }

      // ── Schuss ──────────────────────────────────────────────
      case "shot": {
        const room = rooms[playerRoom];
        if (!room) return;
        // Weiterleiten an Gegner
        const targetWs = playerRole === "host" ? room.guestWs : room.hostWs;
        if (targetWs?.readyState === WebSocket.OPEN) {
          targetWs.send(JSON.stringify({ type: "incoming_shot", row: msg.row, col: msg.col }));
        }
        break;
      }

      // ── Schuss-Ergebnis ─────────────────────────────────────
      case "shot_result": {
        const room = rooms[playerRoom];
        if (!room) return;
        const shooterWs = playerRole === "host" ? room.guestWs : room.hostWs;
        if (shooterWs?.readyState === WebSocket.OPEN) {
          shooterWs.send(JSON.stringify({
            type:    "shot_result",
            row:     msg.row,
            col:     msg.col,
            hit:     msg.hit,
            sunk:    msg.sunk,
            over:    msg.over
          }));
        }
        // Zug wechseln wenn kein Treffer und kein Sieg
        if (!msg.hit && !msg.over) {
          room.currentTurn = room.currentTurn === "host" ? "guest" : "host";
        }
        break;
      }

      // ── Chat / Ping ─────────────────────────────────────────
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  });

  ws.on("close", () => {
    if (!playerRoom || !rooms[playerRoom]) return;
    const room = rooms[playerRoom];
    broadcast(room, { type: "opponent_left" }, ws);
    // Raum löschen wenn Host geht
    if (playerRole === "host") {
      delete rooms[playerRoom];
      console.log(`Room deleted: ${playerRoom}`);
    } else {
      room.guestWs   = null;
      room.guestName = null;
      room.guestReady = false;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Battleship server on port ${PORT}`));
