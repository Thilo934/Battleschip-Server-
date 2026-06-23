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
                    // Zuerst lokale Datenbank prüfen (schneller + zuverlässiger)
                    const localResult = localGenerate(body);
                    const kw = keyword.toLowerCase();
                    // Nur Claude fragen wenn kein lokaler Treffer (Defaultpalette != kw-basiert)
                    // Claude API aufrufen für kreative/unbekannte Keywords
                    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": apiKey,
                            "anthropic-version": "2023-06-01"
                        },
                        body: JSON.stringify({
                            model: "claude-haiku-4-5-20251001",
                            max_tokens: 200,
                            messages: [{
                                role: "user",
                                content: `Du bist ein Farbpaletten-Experte fuer Spielhintergruende. Erstelle eine dunkle, atmosphaerische 5-Farben-Palette fuer das Thema: "${keyword}".

Regeln:
- Alle Farben MUESSEN dunkel sein (Helligkeit < 70%)
- Erste 2 Farben: sehr dunkel (fast schwarz, passend zum Thema)
- Letzte 2 Farben: Akzentfarben die das Thema widerspiegeln
- Bei "Iron Man": Rot-Gold-Schwarz Toene
- Bei "Batman": Schwarz-Gelb Toene
- Bei "Ozean": Tiefblau Toene
- Sei KREATIV und thematisch passend!

Antworte NUR mit exakt diesem JSON, nichts anderes:
{"colors":["#000000","#111111","#222222","#333333","#444444"]}`
                            }]
                        })
                    });
                    const data = await claudeRes.json();
                    const text = data.content?.[0]?.text || "";
                    // JSON extrahieren (auch wenn Claude extra Text schreibt)
                    const match = text.match(/\{[\s\S]*"colors"[\s\S]*\}/);
                    if (match) {
                        const parsed = JSON.parse(match[0]);
                        if (parsed.colors && parsed.colors.length >= 3) {
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify(parsed));
                            return;
                        }
                    }
                    // Claude hat kein valides JSON geliefert → lokale DB
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ colors: localResult }));
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
                const data = JSON.parse(body);
                const { name, wins, losses } = data;
                if (!name || typeof wins !== "number" || typeof losses !== "number") {
                    res.writeHead(400); res.end("Bad request"); return;
                }
                leaderboard[name] = {
                    name, wins, losses,
                    coins: data.coins || 0,
                    pearls: data.pearls || 0,
                    trophies: data.trophies || 0,
                    playTimeSeconds: data.playTime || 0
                };
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400); res.end("Bad request");
            }
        });
        return;
    }

    // Bestenliste: Top-Spieler abrufen (immer nach Siegen sortiert,
    // Client sortiert lokal nach gewuenschtem Tab um)
    if (req.method === "GET" && req.url === "/leaderboard/top") {
        const top = Object.values(leaderboard)
            .sort((a, b) => b.wins - a.wins)
            .slice(0, 100);
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

    // Grosse Datenbank - nach Keywords suchen (Reihenfolge = Prioritaet)
    const map = [
        // ── Superhelden & Comics ──────────────────────────────
        { keys: ["ironman","iron man","tony stark"],
          colors: ["#1A0000","#8B0000","#CC1100","#FF3300","#FFD700"] },
        { keys: ["spiderman","spider man","spider-man"],
          colors: ["#0A0000","#6B0000","#CC0000","#0033CC","#3366FF"] },
        { keys: ["batman","dark knight","bruce wayne"],
          colors: ["#000000","#111111","#1A1A1A","#333300","#CCCC00"] },
        { keys: ["superman","clark kent","man of steel"],
          colors: ["#000D1A","#0022AA","#0033CC","#CC0000","#FFD700"] },
        { keys: ["thor","asgard","mjolnir"],
          colors: ["#0A0A1A","#1A1A3E","#2244AA","#6699FF","#C0C0C0"] },
        { keys: ["hulk","bruce banner","avenger"],
          colors: ["#001A00","#003300","#006600","#00AA00","#66FF00"] },
        { keys: ["captain america","cap","shield"],
          colors: ["#000A1A","#003399","#0044CC","#CC1111","#FFFFFF"] },
        { keys: ["black panther","wakanda","vibranium"],
          colors: ["#000000","#0A0014","#1A0033","#6600CC","#C0C0C0"] },
        { keys: ["deadpool"],
          colors: ["#1A0000","#660000","#CC0000","#FF0000","#1A1A1A"] },
        { keys: ["venom","symbiote"],
          colors: ["#000000","#0A0A0A","#1A1A1A","#2D2D2D","#FFFFFF"] },
        { keys: ["thanos","infinity"],
          colors: ["#0A0014","#1A0033","#4B0082","#7B00D4","#FFD700"] },
        { keys: ["doctor strange","strange","sorcerer"],
          colors: ["#000000","#2D0033","#5C0066","#CC00FF","#FFD700"] },
        { keys: ["wolverine","logan","x-men","xmen"],
          colors: ["#1A0F00","#4D2D00","#996600","#FFCC00","#C0C0C0"] },
        { keys: ["aquaman","atlantis"],
          colors: ["#001A33","#004D66","#006B8F","#00AACC","#FFD700"] },
        { keys: ["flash","speedster"],
          colors: ["#1A0000","#660000","#CC0000","#FF3300","#FFD700"] },
        { keys: ["green lantern"],
          colors: ["#001A00","#004400","#006600","#00CC00","#33FF00"] },
        // ── Filme & Serien ─────────────────────────────────────
        { keys: ["star wars","jedi","lightsaber","darth"],
          colors: ["#000000","#050510","#0A0A20","#003399","#FF0000"] },
        { keys: ["matrix","neo"],
          colors: ["#000000","#001100","#002200","#004400","#00FF00"] },
        { keys: ["tron","grid"],
          colors: ["#000000","#001122","#002244","#004488","#00CCFF"] },
        { keys: ["avatar","pandora","navi"],
          colors: ["#000D1A","#001433","#00264D","#004D4D","#00CCAA"] },
        { keys: ["stranger things","upside down"],
          colors: ["#000000","#0D0000","#1A0000","#CC2200","#FF0000"] },
        { keys: ["breaking bad","walter white"],
          colors: ["#0A0A00","#1A1A00","#3D3D00","#AAAA00","#00AAFF"] },
        { keys: ["game of thrones","westeros","dragon"],
          colors: ["#0A0A00","#2D1A00","#5C3300","#CC6600","#FF9900"] },
        { keys: ["mandalorian","mando","beskar"],
          colors: ["#0A0A0A","#1A1A1A","#333333","#888888","#C0C0C0"] },
        { keys: ["witcher","geralt","kaer morhen"],
          colors: ["#000000","#1A1A00","#3D3D00","#666600","#C0C0C0"] },
        // ── Videospiele ────────────────────────────────────────
        { keys: ["minecraft","creeper"],
          colors: ["#001100","#003300","#006600","#44AA44","#8B4513"] },
        { keys: ["fortnite"],
          colors: ["#0A0020","#1A0040","#3300AA","#8B00FF","#00FFCC"] },
        { keys: ["among us","impostor","crewmate"],
          colors: ["#0A0020","#1A0040","#3300CC","#6633FF","#CC3300"] },
        { keys: ["gta","grand theft auto"],
          colors: ["#000000","#1A2A00","#336600","#66AA00","#FFCC00"] },
        { keys: ["cyberpunk","night city","2077"],
          colors: ["#000000","#001A1A","#00FFFF","#FF00FF","#FFD700"] },
        { keys: ["zelda","link","hyrule","triforce"],
          colors: ["#001A00","#003300","#006600","#33AA00","#FFD700"] },
        { keys: ["pokemon"],
          colors: ["#000A33","#001A66","#0033CC","#FFCC00","#CC0000"] },
        { keys: ["mario","mushroom"],
          colors: ["#000000","#330000","#CC0000","#FF3300","#FFD700"] },
        { keys: ["call of duty","warzone"],
          colors: ["#0A0A00","#1A1A00","#333300","#666600","#999900"] },
        { keys: ["halo","master chief","spartan"],
          colors: ["#001A00","#003300","#006600","#33AA00","#00FFFF"] },
        { keys: ["warcraft","wow","azeroth"],
          colors: ["#001A00","#003300","#0A2600","#1A4400","#FFD700"] },
        { keys: ["league of legends","lol"],
          colors: ["#001122","#002244","#003366","#0055AA","#C89B3C"] },
        { keys: ["overwatch"],
          colors: ["#0A0020","#1A0040","#220066","#6600FF","#FF8C00"] },
        { keys: ["roblox"],
          colors: ["#1A0000","#330000","#660000","#CC1111","#FFFFFF"] },
        { keys: ["apex legends","apex"],
          colors: ["#000000","#1A0000","#3D0000","#CC0000","#FF4500"] },
        { keys: ["battlefield"],
          colors: ["#0A0800","#1A1400","#3D3000","#6B5A00","#CC9900"] },
        { keys: ["minecraft","creeper"],
          colors: ["#001100","#003300","#006600","#44AA44","#8B4513"] },
        { keys: ["doom","hell","demons"],
          colors: ["#1A0000","#4D0000","#990000","#CC3300","#FF6600"] },
        // ── Farben & Stimmungen ────────────────────────────────
        { keys: ["rot","red","rose"],
          colors: ["#1A0000","#4D0000","#8B0000","#CC1100","#FF3300"] },
        { keys: ["blau","blue","ozean","meer","ocean"],
          colors: ["#000D1A","#001F3F","#003D7A","#0066CC","#00AAFF"] },
        { keys: ["grün","gruen","green","wald","natur"],
          colors: ["#001100","#003300","#006600","#00AA00","#33FF00"] },
        { keys: ["lila","purple","violet","violett"],
          colors: ["#0A001A","#1A0033","#33006B","#6600CC","#AA33FF"] },
        { keys: ["orange"],
          colors: ["#1A0500","#3D1200","#8B2E00","#CC5500","#FF8C00"] },
        { keys: ["rosa","pink"],
          colors: ["#1A0011","#4D0033","#990066","#CC0088","#FF69B4"] },
        { keys: ["gold","gelb","yellow"],
          colors: ["#1A1000","#3D2800","#7A5000","#CC8800","#FFD700"] },
        { keys: ["weiß","weiss","white","hell","bright"],
          colors: ["#0A0A14","#141428","#1E1E3C","#6666AA","#CCCCFF"] },
        { keys: ["schwarz","black","dunkel","dark"],
          colors: ["#000000","#080808","#111111","#1A1A1A","#333333"] },
        { keys: ["silber","silver","chrom","chrome"],
          colors: ["#0A0A0A","#1A1A1A","#333333","#888888","#CCCCCC"] },
        // ── Natur & Elemente ───────────────────────────────────
        { keys: ["feuer","fire","lava","magma","flamme"],
          colors: ["#1A0000","#6B0000","#CC2200","#FF6B00","#FFD000"] },
        { keys: ["eis","ice","frost","gefroren","frozen"],
          colors: ["#001F3F","#0077B6","#00B4D8","#90E0EF","#CAF0F8"] },
        { keys: ["blitz","lightning","thunder","gewitter"],
          colors: ["#000011","#000033","#0000AA","#4444FF","#FFFFFF"] },
        { keys: ["weltraum","space","cosmos","universe","galaxis","galaxy"],
          colors: ["#03001C","#1A0533","#3D1A6E","#7B2FBE","#C77DFF"] },
        { keys: ["wüste","wuste","desert","sand","sahara"],
          colors: ["#1A0F00","#4A2C00","#8B5E3C","#D4A762","#F5C57A"] },
        { keys: ["dschungel","jungle","tropisch","tropical"],
          colors: ["#001100","#002200","#004400","#007700","#00CC44"] },
        { keys: ["winter","schnee","snow"],
          colors: ["#03045E","#0077B6","#00B4D8","#ADE8F4","#FFFFFF"] },
        { keys: ["herbst","autumn","fall"],
          colors: ["#1A0A00","#5C1A00","#8B3A00","#CC6600","#FF9900"] },
        { keys: ["sturm","storm","gewitter"],
          colors: ["#0A0A14","#141420","#202030","#3D3D60","#8080AA"] },
        { keys: ["vulkan","volcano","eruption"],
          colors: ["#1A0000","#3D0000","#8B0000","#D62828","#FF6600"] },
        // ── Stile & Aesthetics ─────────────────────────────────
        { keys: ["neon","glow","leuchtend"],
          colors: ["#000000","#0A001A","#1A0033","#7F00FF","#00FF88"] },
        { keys: ["cyber","cyberpunk","futur"],
          colors: ["#000000","#001A1A","#003333","#00FFFF","#FF00FF"] },
        { keys: ["retro","80er","synthwave","vapor"],
          colors: ["#0D0030","#1A0060","#3300CC","#CC00FF","#FF66CC"] },
        { keys: ["steampunk","dampf","victorian"],
          colors: ["#1A0F00","#3D2800","#7A5000","#CC8800","#8B5E3C"] },
        { keys: ["horror","grusel","zombie"],
          colors: ["#000000","#0A0000","#1A0000","#4D0000","#CC0000"] },
        { keys: ["pastel","pastell","sanft","soft"],
          colors: ["#1A1428","#2D2040","#443060","#9966CC","#CC99FF"] },
        { keys: ["natur","natural","earth"],
          colors: ["#0A1628","#1B4332","#2D6A4F","#52B788","#95D5B2"] },
        // ── Schiffe & Meer (passt zum Spiel) ──────────────────
        { keys: ["pirat","pirate","schwarzbart","jolly roger"],
          colors: ["#000000","#1A1100","#3D2800","#8B0000","#CC0000"] },
        { keys: ["schiff","ship","naval","marine","navy"],
          colors: ["#000D1A","#001F3F","#003366","#004D99","#336699"] },
        { keys: ["koralle","coral","reef","riff"],
          colors: ["#001A1A","#003333","#005555","#FF6633","#FF9966"] },
        { keys: ["tinte","tinte","squid","kraken","oktopus"],
          colors: ["#000000","#0A001A","#1A0033","#4B0082","#8B008B"] },
        // ── Sonstige beliebte Begriffe ─────────────────────────
        { keys: ["regenbogen","rainbow"],
          colors: ["#1A0000","#CC2200","#CC8800","#00AA00","#0044CC"] },
        { keys: ["drachen","dragon","drachon"],
          colors: ["#1A0000","#4D0000","#8B0000","#CC3300","#FF6600"] },
        { keys: ["engel","angel","heaven","paradies"],
          colors: ["#1A1A28","#2E2E4E","#6666AA","#AAAAEE","#FFFFFF"] },
        { keys: ["teufel","devil","daemon","demon"],
          colors: ["#1A0000","#4D0000","#8B0000","#CC0000","#FF0000"] },
        { keys: ["ninja","schatten","shadow"],
          colors: ["#000000","#0A0A0A","#141414","#1E1E1E","#333333"] },
        { keys: ["samurai","japan","tokyo","katana"],
          colors: ["#0A0000","#1A0000","#4D0000","#CC0000","#FFFFFF"] },
        { keys: ["ägypten","egypt","pyramid","pharao"],
          colors: ["#1A1400","#3D3000","#7A6000","#CC9900","#FFD700"] },
        { keys: ["wikinger","viking","norse","odin"],
          colors: ["#001122","#002244","#114466","#336688","#C0C0C0"] },
        { keys: ["zombie","untot","undead","apokalypse"],
          colors: ["#000800","#001100","#0A1A0A","#334433","#556655"] },
        { keys: ["hacker","code","matrix","computer"],
          colors: ["#000000","#001100","#002200","#004400","#00FF00"] },
    ];

    // Keyword suchen - alle Treffer summieren
    const kw = keyword.toLowerCase().replace(/[-_]/g, " ");
    for (const entry of map) {
        for (const k of entry.keys) {
            if (kw.includes(k)) return entry.colors;
        }
    }

    // Keine Uebereinstimmung - generiere Palette aus Zeichenwerten des Keywords
    // (deterministisch, kein echter Zufall)
    let seed = 0;
    for (let i = 0; i < kw.length; i++) seed += kw.charCodeAt(i) * (i + 1);
    const palettes = [
        ["#03001C","#1A0533","#3D1A6E","#7B2FBE","#C77DFF"],
        ["#0D0628","#1A0B4E","#2E1065","#7C3AED","#A78BFA"],
        ["#0C1B33","#1B3A6B","#1B618C","#0E9BC0","#56C7DE"],
        ["#1A0000","#4D0000","#8B0000","#CC1100","#FF3300"],
        ["#001100","#003300","#006600","#00AA00","#66CC00"],
        ["#1A1000","#4D3300","#8B5E00","#CC8800","#FFD700"],
        ["#000000","#001A1A","#003333","#00AAAA","#00FFFF"],
        ["#1A0011","#4D0033","#990066","#CC0099","#FF66CC"],
        ["#000D1A","#001F3F","#003D7A","#0066CC","#00AAFF"],
        ["#0A0A14","#141428","#282844","#4444AA","#8888FF"],
    ];
    return palettes[seed % palettes.length];
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
