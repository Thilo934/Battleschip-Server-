const WebSocket = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Battleship Server OK");
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
  let room = null;
  let role = null;

  // Ping alle 20s damit Render die Verbindung offen haelt
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 20000);

  ws.on("pong", () => {}); // pong empfangen

  ws.on("message", raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    console.log("MSG:", msg.type, msg.code || "", msg.name || "");

    switch (msg.type) {

      case "create": {
        const code = (msg.code || "").toUpperCase();
        if (!code) return;
        if (rooms[code]) {
          send(ws, { type: "error", text: "Code bereits vergeben" });
          return;
        }
        rooms[code] = {
          code,
          hostName: msg.name || "Host",
          guestName: null,
          hostWs: ws,
          guestWs: null,
          started: false,
          hostReady: false,
          guestReady: false
        };
        room = code;
        role = "host";
        send(ws, { type: "created", code });
        console.log("Room created:", code);
        break;
      }

      case "join": {
        const code = (msg.code || "").toUpperCase();
        const r = rooms[code];
        if (!r) {
          send(ws, { type: "error", text: "Raum nicht gefunden" });
          return;
        }
        if (r.guestWs) {
          send(ws, { type: "error", text: "Raum ist voll" });
          return;
        }
        r.guestWs = ws;
        r.guestName = msg.name || "Gast";
        room = code;
        role = "guest";
        send(ws, {
          type: "joined",
          code,
          hostName: r.hostName,
          guestName: r.guestName
        });
        send(r.hostWs, {
          type: "guest_joined",
          guestName: r.guestName
        });
        console.log("Guest joined:", code);
        break;
      }

      case "start_game": {
        const r = rooms[room];
        if (!r || role !== "host") return;
        if (!r.guestWs) {
          send(ws, { type: "error", text: "Kein Gegner" });
          return;
        }
        r.started = true;
        broadcast(r, { type: "game_started" });
        console.log("Game started:", room);
        break;
      }

      case "ships_ready": {
        const r = rooms[room];
        if (!r) return;
        if (role === "host") r.hostReady = true;
        else r.guestReady = true;
        broadcast(r, { type: "player_ready", role }, ws);
        if (r.hostReady && r.guestReady) {
          const first = Math.random() < 0.5 ? "host" : "guest";
          broadcast(r, { type: "battle_start", firstTurn: first });
          console.log("Battle start:", room, "first:", first);
        }
        break;
      }

      case "shot": {
        const r = rooms[room];
        if (!r) return;
        const target = role === "host" ? r.guestWs : r.hostWs;
        send(target, {
          type: "incoming_shot",
          row: msg.row,
          col: msg.col
        });
        break;
      }

      case "shot_result": {
        const r = rooms[room];
        if (!r) return;
        const shooter = role === "host" ? r.guestWs : r.hostWs;
        send(shooter, {
          type: "shot_result",
          row: msg.row,
          col: msg.col,
          hit: msg.hit,
          sunk: msg.sunk,
          over: msg.over
        });
        break;
      }

      case "ping":
        send(ws, { type: "pong" });
        break;
    }
  });

  ws.on("close", () => {
    clearInterval(ping);
    if (!room || !rooms[room]) return;
    const r = rooms[room];
    broadcast(r, { type: "opponent_left" }, ws);
    if (role === "host") {
      delete rooms[room];
      console.log("Room deleted:", room);
    } else {
      r.guestWs = null;
      r.guestName = null;
      r.guestReady = false;
    }
  });

  ws.on("error", err => {
    console.error("WS error:", err.message);
    clearInterval(ping);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Battleship server running on port", PORT);
});
