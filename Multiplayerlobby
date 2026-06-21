import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(board) {
  for (const pattern of WIN_PATTERNS) {
    const [a,b,c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return { winner: board[a], line: pattern };
  }
  if (board.every(Boolean)) return { winner: "draw", line: [] };
  return null;
}

function makeCode() {
  return Math.random().toString(36).substring(2,7).toUpperCase();
}

function makePlayerId() {
  return "p_" + Math.random().toString(36).substring(2,10);
}

// ─── Storage helpers (shared=true for multiplayer sync) ──────────────────────
async function saveRoom(roomCode, data) {
  try {
    await window.storage.set("room:" + roomCode, JSON.stringify(data), true);
    return true;
  } catch { return false; }
}

async function loadRoom(roomCode) {
  try {
    const r = await window.storage.get("room:" + roomCode, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Mono:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body { background: #080b14; }

  .root {
    min-height: 100vh;
    background: #080b14;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    color: #e8eaf6;
    overflow: hidden;
    position: relative;
  }

  .grid-bg {
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,240,180,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,240,180,0.03) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
  }

  .glow-orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(120px);
    pointer-events: none;
  }

  .card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 40px;
    width: min(420px, 94vw);
    position: relative;
    z-index: 1;
    backdrop-filter: blur(20px);
    box-shadow: 0 0 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .logo {
    font-family: 'Orbitron', monospace;
    font-size: clamp(22px, 6vw, 28px);
    font-weight: 900;
    letter-spacing: 4px;
    background: linear-gradient(135deg, #00f0b4, #00c8f0);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-align: center;
    margin-bottom: 6px;
  }

  .tagline {
    text-align: center;
    font-size: 11px;
    color: rgba(255,255,255,0.25);
    letter-spacing: 3px;
    margin-bottom: 36px;
  }

  .section-label {
    font-size: 10px;
    letter-spacing: 2px;
    color: rgba(255,255,255,0.3);
    margin-bottom: 10px;
    text-transform: uppercase;
  }

  .input {
    width: 100%;
