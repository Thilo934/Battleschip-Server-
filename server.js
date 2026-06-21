const WebSocket = require("ws");
const http = require("http");

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204); res.end(); return;
    }

    // KI Hintergrund Generator
    if (req.method === "POST" && req.url === "/generate-bg") {
        let body = "";
        req.on("data", chunk => { body += chunk.toString(); });
        req.on("end", async () => {
            try {
                const { keyword } = JSON.parse(body);
                const apiKey = process.env.ANTHROPIC_API_KEY;
                
                if (apiKey) {
                    // Claude API aufrufen
                    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": apiKey,
                            "anthropic-version": "2023-06-01"
                        },
                        body: JSON.stringify({
                            model: "claude-haiku-4-5-20251001",
                            max_tokens: 150,
                            messages: [{
                                role: "user",
                                content: `Erstelle eine atmosphaerische dunkle Farbpalette fuer ein Spiel-Hintergrundbild mit dem Thema: "${keyword}". Antworte NUR mit JSON, kein anderer Text: {"colors":["#hex1","#hex2","#hex3","#hex4","#hex5"]}. Dunkle, stimmungsvolle Farben die gut als Spielhintergrund aussehen.`
                            }]
                        })
                    });
                    const data = await claudeRes.json();
                    const text = data.content[0].text;
                    const parsed = JSON.parse(text);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(parsed));
                    return;
                }
            } catch(e) {}
            // Fallback: eingebaute Paletten
            const colors = localGenerate(body);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ colors }));
        });
        return;
    }

    // Bestenliste: Score einreichen
    if (req.method === "POST" && req.url === "/leaderboard/submit") {
        let body = "";
        req.on("data", chunk => { body += chunk.toString(); });
        req.on("end", () => {
            try {
                const { name, wins, losses } = JSON.parse(body);
                if (!name || typeof wins !== "number" || typeof losses !== "number") {
                    res.writeHead(400); res.end("Bad request"); return;
                }
                leaderboard[name] = { name, wins, losses };
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400); res.end("Bad request");
            }
        });
        return;
    }

    // Bestenliste: Top-Spieler abrufen
    if (req.method === "GET" && req.url === "/leaderboard/top") {
        const top = Object.values(leaderboard)
            .sort((a, b) => b.wins - a.wins)
            .slice(0, 20);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ entries: top }));
        return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Battleship OK");
});

// In-Memory Bestenliste (resettet bei Server-Neustart)
const leaderboard = {};

function localGenerate(rawBody) {
    let keyword = "";
    try { keyword = JSON.parse(rawBody).keyword.toLowerCase(); } catch {}
    const map = {
        ozean:    ["#000D1A","#001F3F","#003D7A","#0066CC","#00AAFF"],
        meer:     ["#001219","#005F73","#0A9396","#94D2BD","#E9D8A6"],
        weltraum: ["#03001C","#1A0533","#3D1A6E","#7B2FBE","#C77DFF"],
        galaxis:  ["#000011","#0D0630","#26095E","#5603AD","#BC12FE"],
        feuer:    ["#1A0000","#6B0000","#CC2200","#FF6B00","#FFD000"],
        lava:     ["#1A0000","#3D0000","#8B0000","#D62828","#F77F00"],
        eis:      ["#001F3F","#0077B6","#00B4D8","#90E0EF","#CAF0F8"],
        winter:   ["#03045E","#0077B6","#00B4D8","#ADE8F4","#FFFFFF"],
        wald:     ["#001A00","#0D3D00","#1A6600","#33A300","#66CC00"],
        natur:    ["#0A1628","#1B4332","#2D6A4F","#52B788","#95D5B2"],
        neon:     ["#000000","#0A001A","#1A0033","#7F00FF","#00FF88"],
        cyber:    ["#000000","#001A1A","#003333","#00FFFF","#FF00FF"],
        gold:     ["#1A1000","#3D2800","#7A5000","#CC8800","#FFD700"],
        sand:     ["#1A0F00","#4A2C00","#8B5E3C","#D4A762","#F5DEB3"],
        blut:     ["#1A0000","#4D0000","#8B0000","#CC0000","#FF2222"],
        dunkel:   ["#000000","#111111","#1A1A2E","#16213E","#0F3460"],
        licht:    ["#1A1A2E","#2E2E4E","#4E4E8E","#8E8ECC","#CCCCFF"],
        rosa:     ["#1A0011","#4D0033","#990066","#CC0066","#FF69B4"],
        herbst:   ["#1A0A00","#5C1A00","#8B3A00","#CC6600","#FF9900"],
        geist:    ["#0A0A0A","#1A1A1A","#2D2D2D","#4A4A4A","#888888"],
    };
    for (const [k, v] of Object.entries(map)) {
        if (keyword.includes(k)) return v;
    }
    // Zufaellig schoene Palette
    const defaults = [
        ["#0D0628","#1A0B4E","#2E1065","#7C3AED","#A78BFA"],
        ["#0C1B33","#1B3A6B","#1B618C","#0E9BC0","#56C7DE"],
        ["#0F2027","#203A43","#2C5364","#3A7CA5","#5BA4CF"],
    ];
    return defaults[Math.floor(Math.random() * defaults.length)];
}

const wss = new WebSocket.Server({ server });
const rooms = {};

function send(ws, obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exclude) {
    [room.hostWs, room.guestWs].forEach(ws => {
        if (ws && ws !== exclude) send(ws, obj);
    });
}

wss.on("connection", ws => {
    let roomCode = null; let role = null;
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
                if (rooms[code]) { send(ws, { type:"error", text:"Code bereits vergeben" }); return; }
                rooms[code] = { code, hostName: msg.name||"Host", guestName:null, hostWs:ws, guestWs:null, hostReady:false, guestReady:false, hostShips:[], guestShips:[] };
                roomCode = code; role = "host";
                send(ws, { type:"created", code }); break;
            }
            case "join": {
                const code = (msg.code||"").toUpperCase();
                const r = rooms[code];
                if (!r) { send(ws, { type:"error", text:"Raum nicht gefunden" }); return; }
                if (r.guestWs) { send(ws, { type:"error", text:"Raum ist voll" }); return; }
                r.guestWs = ws; r.guestName = msg.name||"Gast";
                roomCode = code; role = "guest";
                send(ws, { type:"joined", code, hostName:r.hostName, guestName:r.guestName });
                send(r.hostWs, { type:"guest_joined", guestName:r.guestName }); break;
            }
            case "start_game": {
                const r = rooms[roomCode];
                if (!r || role!=="host") return;
                if (!r.guestWs) { send(ws, { type:"error", text:"Kein Gegner" }); return; }
                r.hostReady=false; r.guestReady=false; r.hostShips=[]; r.guestShips=[];
                r.mode = msg.mode || "Standard";
                broadcast(r, { type:"game_started", mode:r.mode }); break;
            }
            case "ships_ready": {
                const r = rooms[roomCode];
                if (!r) return;
                if (role==="host") { r.hostReady=true; r.hostShips=msg.ships||[]; }
                else { r.guestReady=true; r.guestShips=msg.ships||[]; }
                broadcast(r, { type:"player_ready", role }, ws);
                if (r.hostReady && r.guestReady) {
                    const first = Math.random()<0.5?"host":"guest";
                    send(r.hostWs, { type:"battle_start", firstTurn:first, enemyShips:r.guestShips });
                    send(r.guestWs, { type:"battle_start", firstTurn:first, enemyShips:r.hostShips });
                }
                break;
            }
            case "shot": {
                const r = rooms[roomCode]; if (!r) return;
                const t = role==="host"?r.guestWs:r.hostWs;
                send(t, { type:"incoming_shot", row:msg.row, col:msg.col }); break;
            }
            case "shot_result": {
                const r = rooms[roomCode]; if (!r) return;
                const s = role==="host"?r.guestWs:r.hostWs;
                send(s, { type:"shot_result", row:msg.row, col:msg.col, hit:msg.hit, sunk:msg.sunk, over:msg.over }); break;
            }
            case "taunt": {
                const r = rooms[roomCode]; if (!r) return;
                broadcast(r, { type:"taunt", text:msg.text, fromRole:role }, ws); break;
            }
            case "play_again": {
                const r = rooms[roomCode]; if (!r) return;
                broadcast(r, { type:"play_again_request", role }, ws); break;
            }
            case "ping": send(ws, { type:"pong" }); break;
        }
    });

    ws.on("close", () => {
        clearInterval(ping);
        if (!roomCode || !rooms[roomCode]) return;
        const r = rooms[roomCode];
        broadcast(r, { type:"opponent_left" }, ws);
        if (role==="host") { delete rooms[roomCode]; }
        else { r.guestWs=null; r.guestName=null; r.guestReady=false; r.guestShips=[]; }
    });
    ws.on("error", err => { console.error("WS error:", err.message); clearInterval(ping); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Battleship server on port", PORT));
