import "dotenv/config";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECULOS_URL = process.env.SPECULOS_URL ?? "http://localhost:5100";
const PORT = 3000;

const app = express();
app.use(express.json());

app.get("/api/screenshot", async (_req, res) => {
  try {
    const r = await fetch(`${SPECULOS_URL}/screenshot`);
    const buf = await r.arrayBuffer();
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-cache");
    res.send(Buffer.from(buf));
  } catch {
    res.status(502).end();
  }
});

app.post("/api/button/:btn", async (req, res) => {
  try {
    await fetch(`${SPECULOS_URL}/button/${req.params.btn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "press-and-release" }),
    });
    res.json({ ok: true });
  } catch {
    res.status(502).json({ ok: false });
  }
});

app.get("/", (_req, res) => {
  res.set("Content-Type", "text/html");
  res.send(HTML);
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let child: ReturnType<typeof spawn> | null = null;

  ws.on("message", (raw) => {
    try {
      const { command } = JSON.parse(raw.toString()) as { command: string };
      if (!command?.trim()) return;
      child?.kill();
      child = spawn("node", [join(__dirname, "../dist/index.js"), command], {
        cwd: join(__dirname, ".."),
        env: process.env,
      });
      const send = (type: string, text: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type, text }));
        }
      };
      child.stdout?.on("data", (c: Buffer) => send("stdout", c.toString()));
      child.stderr?.on("data", (c: Buffer) => send("stderr", c.toString()));
      child.on("close", (code) => send("done", String(code ?? 0)));
    } catch { /* ignore */ }
  });

  ws.on("close", () => child?.kill());
});

server.listen(PORT, () => {
  console.log(`\n  Ledger Agent UI  →  http://localhost:${PORT}\n`);
});

// ─────────────────────────────────────────────────────────────────────────────
const HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ledger-Gated Agent</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#07090f;
  --bg2:#0b0e18;
  --surface:rgba(255,255,255,0.03);
  --surface2:rgba(255,255,255,0.05);
  --border:rgba(255,255,255,0.07);
  --border2:rgba(255,255,255,0.13);
  --teal:#2de2b8;
  --teal2:#1fb899;
  --teal-glow:rgba(45,226,184,0.18);
  --teal-dim:rgba(45,226,184,0.08);
  --amber:#f5a623;
  --amber-dim:rgba(245,166,35,0.08);
  --amber-border:rgba(245,166,35,0.22);
  --red:#ef4444;
  --violet:#7c3aed;
  --text:#d8dde8;
  --text2:#8a94a6;
  --text3:#4e5568;
  --white:#f0f4ff;
  --font:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;
  --mono:'SF Mono','Fira Code','JetBrains Mono','Cascadia Code',monospace;
  --r:12px;
}

html,body{height:100%;overflow:hidden}

body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--font);
  font-size:14px;
  display:flex;
  flex-direction:column;
}

/* noise texture overlay */
body::before{
  content:'';
  position:fixed;inset:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
  pointer-events:none;z-index:0;
}

/* ── Header ── */
header{
  position:relative;z-index:10;
  display:flex;align-items:center;gap:12px;
  padding:0 20px;height:54px;
  border-bottom:1px solid var(--border);
  background:rgba(7,9,15,0.85);
  backdrop-filter:blur(24px);
  flex-shrink:0;
}

.pulse{
  width:7px;height:7px;border-radius:50%;
  background:var(--red);
  box-shadow:0 0 8px var(--red);
  transition:background .4s,box-shadow .4s;
  flex-shrink:0;
}
.pulse.on{background:var(--teal);box-shadow:0 0 8px var(--teal);animation:pulse 2.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}

.logo{
  width:28px;height:28px;border-radius:8px;
  background:linear-gradient(135deg,var(--teal),var(--violet));
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:900;color:#fff;
  box-shadow:0 0 16px var(--teal-glow);
  flex-shrink:0;letter-spacing:-.02em;
}
.brand-name{font-size:14px;font-weight:700;color:var(--white);letter-spacing:-.025em}

.hright{margin-left:auto;display:flex;align-items:center;gap:8px}
.pill{
  font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  padding:4px 10px;border-radius:20px;border:1px solid var(--border2);
  color:var(--text2);background:var(--surface);
  transition:all .2s;
}
.pill.live{border-color:var(--teal);color:var(--teal);background:var(--teal-dim)}

/* ── Layout ── */
.layout{position:relative;z-index:1;display:flex;flex:1;overflow:hidden}

/* ── Chat panel ── */
.chat{flex:1;display:flex;flex-direction:column;border-right:1px solid var(--border);min-width:0}

.msgs{
  flex:1;overflow-y:auto;
  padding:20px 20px 12px;
  display:flex;flex-direction:column;gap:18px;
  scroll-behavior:smooth;
}
.msgs::-webkit-scrollbar{width:3px}
.msgs::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}

/* welcome */
.welcome{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  gap:14px;text-align:center;padding:40px 32px;
}
.w-icon{
  width:60px;height:60px;border-radius:18px;
  border:1px solid var(--border2);
  background:var(--surface);
  display:flex;align-items:center;justify-content:center;
  font-size:28px;margin-bottom:4px;
}
.welcome h2{
  font-size:20px;font-weight:700;
  color:var(--white);letter-spacing:-.03em;
  line-height:1.3;
}
.welcome p{font-size:13px;line-height:1.8;color:var(--text2);max-width:340px}
.tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:8px}
.tag{
  font-size:11px;font-family:var(--mono);
  background:var(--surface);border:1px solid var(--border2);
  color:var(--text2);padding:5px 12px;border-radius:8px;
  cursor:pointer;transition:all .15s;
}
.tag:hover{border-color:var(--teal);color:var(--teal);background:var(--teal-dim);transform:translateY(-1px)}

/* messages */
.msg{display:flex;flex-direction:column;gap:5px}

.msg-u{align-items:flex-end}
.msg-u .bub{
  background:linear-gradient(135deg,var(--teal),var(--teal2));
  color:#001a14;font-weight:600;
  padding:10px 16px;border-radius:18px 18px 4px 18px;
  font-size:14px;line-height:1.5;max-width:78%;word-break:break-word;
  box-shadow:0 4px 20px rgba(45,226,184,.2);
}

.msg-a{align-items:flex-start;max-width:95%}
.a-hd{
  display:flex;align-items:center;gap:7px;
  font-size:11px;color:var(--text3);font-weight:600;
  letter-spacing:.03em;padding:0 2px;
}
.a-av{
  width:20px;height:20px;border-radius:6px;
  background:linear-gradient(135deg,var(--violet),var(--teal));
  display:flex;align-items:center;justify-content:center;
  font-size:10px;color:#fff;font-weight:800;flex-shrink:0;
}
.msg-a .bub{
  background:var(--surface2);border:1px solid var(--border2);
  border-radius:4px 16px 16px 16px;
  padding:12px 16px;
  font-family:var(--mono);font-size:12.5px;line-height:1.75;
  color:var(--white);white-space:pre-wrap;word-break:break-all;
  backdrop-filter:blur(8px);
  transition:border-color .3s,background .3s;
}
.msg-a .bub.ok{border-color:var(--teal);background:rgba(45,226,184,.06)}
.msg-a .bub.err{border-color:var(--red);background:rgba(239,68,68,.06)}

.msg-d{align-items:flex-start}
.d-row{display:flex;align-items:flex-start;gap:9px}
.d-ic{
  width:28px;height:28px;flex-shrink:0;
  background:var(--amber-dim);border:1px solid var(--amber-border);
  border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-size:12px;margin-top:1px;
}
.d-bub{
  background:var(--amber-dim);border:1px solid var(--amber-border);
  border-radius:4px 12px 12px 12px;
  padding:9px 13px;font-size:12px;line-height:1.65;
  color:var(--amber);font-family:var(--mono);white-space:pre-wrap;
}

/* typing dots */
.typing-wrap{align-items:flex-start}
.typing-bub{
  display:flex;align-items:center;gap:5px;
  background:var(--surface2);border:1px solid var(--border2);
  border-radius:4px 16px 16px 16px;padding:13px 16px;
}
.td{width:6px;height:6px;border-radius:50%;background:var(--text3);animation:td 1.3s infinite}
.td:nth-child(2){animation-delay:.15s}
.td:nth-child(3){animation-delay:.3s}
@keyframes td{0%,80%,100%{opacity:.25;transform:scale(.75)}40%{opacity:1;transform:scale(1)}}

/* input */
.input-zone{
  padding:12px 16px;border-top:1px solid var(--border);
  background:rgba(7,9,15,.9);backdrop-filter:blur(20px);flex-shrink:0;
}
.iw{
  display:flex;align-items:center;gap:6px;
  background:var(--surface2);border:1px solid var(--border2);
  border-radius:14px;padding:5px 5px 5px 16px;
  transition:border-color .2s,box-shadow .2s;
}
.iw:focus-within{
  border-color:var(--teal);
  box-shadow:0 0 0 3px var(--teal-glow);
}
.iw input{
  flex:1;background:transparent;border:none;outline:none;
  color:var(--white);font-family:var(--mono);font-size:13px;
  padding:7px 0;
}
.iw input::placeholder{color:var(--text3)}
.sbtn{
  width:36px;height:36px;border-radius:10px;border:none;
  background:linear-gradient(135deg,var(--teal),var(--teal2));
  color:#001a14;font-size:15px;font-weight:900;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:opacity .15s,transform .1s,box-shadow .15s;
  box-shadow:0 2px 10px rgba(45,226,184,.3);flex-shrink:0;
}
.sbtn:disabled{opacity:.25;cursor:default}
.sbtn:hover:not(:disabled){opacity:.85;transform:scale(1.06)}
.sbtn:active:not(:disabled){transform:scale(.94)}

/* ── Device panel ── */
.dev-panel{
  width:360px;flex-shrink:0;display:flex;flex-direction:column;
  overflow-y:auto;overflow-x:hidden;
  background:var(--bg2);
  background-image:radial-gradient(ellipse at 50% 0%,rgba(45,226,184,.05) 0%,transparent 65%);
}
.dev-panel::-webkit-scrollbar{width:0}

.sec{padding:18px;border-bottom:1px solid var(--border)}
.sec:last-child{border-bottom:none}
.sec-lbl{
  font-size:9.5px;font-weight:800;letter-spacing:.12em;
  text-transform:uppercase;color:var(--text3);margin-bottom:14px;
}

/* device frame */
.dev-frame{
  background:linear-gradient(160deg,#181c28,#0e1019);
  border:1px solid rgba(255,255,255,0.09);
  border-radius:18px;padding:18px 18px 14px;
  display:flex;flex-direction:column;align-items:center;gap:14px;
  box-shadow:
    0 24px 64px rgba(0,0,0,.6),
    inset 0 1px 0 rgba(255,255,255,.07),
    0 0 0 1px rgba(0,0,0,.5);
  position:relative;overflow:hidden;
}
.dev-frame::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);
}
.dev-model{
  font-size:9px;font-weight:700;letter-spacing:.18em;
  color:rgba(255,255,255,.2);text-transform:uppercase;align-self:flex-start;
}

/* screen */
.screen-bezel{
  width:100%;background:#000;
  border-radius:5px;padding:8px;
  border:1px solid #161616;
  box-shadow:0 0 0 1px #0a0a0a,inset 0 2px 6px rgba(0,0,0,.9);
}
.screen-inner{
  position:relative;background:#000;border-radius:3px;overflow:hidden;line-height:0;
}
.screen-inner img{
  width:100%;aspect-ratio:2/1;image-rendering:pixelated;display:block;
  filter:brightness(1.05) contrast(1.05);
}
.screen-inner::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.03) 0%,transparent 50%);
  pointer-events:none;
}

/* device status */
.dev-status{
  display:flex;align-items:center;gap:8px;
  font-size:11px;font-weight:700;letter-spacing:.06em;
  color:var(--teal);
}
.ds-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--teal);
  box-shadow:0 0 6px var(--teal);
  animation:pulse 2.4s infinite;
}

/* hw buttons */
.hw-row{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:8px;width:100%}
.hw{
  background:linear-gradient(160deg,#1e2233,#171a25);
  border:1px solid rgba(255,255,255,.07);
  border-radius:10px;
  color:var(--text2);font-family:var(--mono);font-size:11px;font-weight:700;
  padding:11px 6px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:4px;
  transition:all .12s;letter-spacing:.03em;
  box-shadow:0 2px 6px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05);
  user-select:none;
}
.hw:hover{
  background:linear-gradient(160deg,#252a3a,#1c2030);
  border-color:rgba(255,255,255,.14);color:var(--white);
  transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.4);
}
.hw:active{transform:translateY(1px);box-shadow:0 1px 3px rgba(0,0,0,.5)}
.hw.chk{
  background:linear-gradient(135deg,rgba(45,226,184,.14),rgba(45,226,184,.06));
  border-color:rgba(45,226,184,.4);color:var(--teal);
  box-shadow:0 2px 16px rgba(45,226,184,.12),inset 0 1px 0 rgba(45,226,184,.1);
}
.hw.chk:hover{
  background:linear-gradient(135deg,rgba(45,226,184,.22),rgba(45,226,184,.1));
  box-shadow:0 4px 24px rgba(45,226,184,.2);
}

/* quick actions */
.qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.qa{
  background:var(--surface);border:1px solid var(--border2);
  border-radius:14px;padding:14px;
  cursor:pointer;transition:all .15s;
  display:flex;flex-direction:column;gap:5px;
}
.qa:hover{
  border-color:var(--teal);background:var(--teal-dim);
  transform:translateY(-2px);box-shadow:0 8px 24px rgba(45,226,184,.08);
}
.qa:active{transform:translateY(0)}
.qa-ic{font-size:20px;line-height:1}
.qa-lbl{font-size:13px;font-weight:700;color:var(--white);letter-spacing:-.01em}
.qa-sub{font-size:10px;color:var(--text3);font-family:var(--mono);line-height:1.5}

/* trust card */
.trust{
  display:flex;gap:11px;
  background:rgba(45,226,184,.04);border:1px solid rgba(45,226,184,.1);
  border-radius:12px;padding:13px;font-size:11.5px;line-height:1.65;color:var(--text2);
}
.trust-ic{font-size:18px;flex-shrink:0;margin-top:1px}
.trust strong{color:var(--teal)}
</style>
</head>
<body>

<header>
  <div class="pulse" id="pulse"></div>
  <div class="logo">L</div>
  <div class="brand-name">ledger-gated-agent</div>
  <div class="hright">
    <div class="pill">Sepolia · ETH</div>
    <div class="pill" id="statusPill">Connecting</div>
  </div>
</header>

<div class="layout">

  <!-- Chat -->
  <div class="chat">
    <div class="msgs" id="msgs">
      <div class="welcome" id="welcome">
        <div class="w-icon">⛓</div>
        <h2>Agent proposes.<br>Ledger disposes.</h2>
        <p>Ask anything in natural language. Read-only queries run instantly over RPC. Every value transfer is blocked until you physically approve it on the device.</p>
        <div class="tags">
          <span class="tag" onclick="fill('balance')">balance</span>
          <span class="tag" onclick="fill('history')">history</span>
          <span class="tag" onclick="fill('address')">address</span>
          <span class="tag" onclick="fill('send 0.001 ETH to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')">send ETH →</span>
        </div>
      </div>
    </div>
    <div class="input-zone">
      <div class="iw">
        <input id="cmd" type="text" placeholder="balance · history · send 0.001 ETH to 0x…" autocomplete="off"/>
        <button class="sbtn" id="sbtn" onclick="send()" title="Send (Enter)">↑</button>
      </div>
    </div>
  </div>

  <!-- Device -->
  <div class="dev-panel">

    <div class="sec">
      <div class="sec-lbl">Emulated device</div>
      <div class="dev-frame">
        <div class="dev-model">Nano S Plus · Ethereum 1.22.1</div>
        <div class="screen-bezel">
          <div class="screen-inner">
            <img id="screen" src="/api/screenshot" alt="screen"/>
          </div>
        </div>
        <div class="dev-status">
          <div class="ds-dot" id="dsDot"></div>
          <span id="dsText">READY</span>
        </div>
        <div class="hw-row">
          <button class="hw" onclick="btn('left')" title="Navigate left">◀ left</button>
          <button class="hw chk" onclick="btn('both')" title="Confirm">✓ both</button>
          <button class="hw" onclick="btn('right')" title="Navigate right">right ▶</button>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-lbl">Quick actions</div>
      <div class="qa-grid">
        <div class="qa" onclick="fill('balance')">
          <div class="qa-ic">💰</div>
          <div class="qa-lbl">Balance</div>
          <div class="qa-sub">No device · RPC only</div>
        </div>
        <div class="qa" onclick="fill('history')">
          <div class="qa-ic">📜</div>
          <div class="qa-lbl">History</div>
          <div class="qa-sub">Tx count on-chain</div>
        </div>
        <div class="qa" onclick="fill('address')">
          <div class="qa-ic">🔑</div>
          <div class="qa-lbl">Address</div>
          <div class="qa-sub">Derive from device</div>
        </div>
        <div class="qa" onclick="fill('send 0.001 ETH to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')">
          <div class="qa-ic">⚡</div>
          <div class="qa-lbl">Send ETH</div>
          <div class="qa-sub">Requires approval</div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="trust">
        <div class="trust-ic">🛡</div>
        <div>
          <strong>Hardware gate active.</strong> The agent can assemble any transaction — but cannot sign without your approval on this screen. Prompt injections end here.
        </div>
      </div>
    </div>

  </div>
</div>

<script>
const msgsEl  = document.getElementById('msgs');
const cmdEl   = document.getElementById('cmd');
const sbtnEl  = document.getElementById('sbtn');
const screen  = document.getElementById('screen');
const pulse   = document.getElementById('pulse');
const pill    = document.getElementById('statusPill');
const dsDot   = document.getElementById('dsDot');
const dsText  = document.getElementById('dsText');
const welcome = document.getElementById('welcome');

let ws, retryT;
let agentEl = null, agentTxt = '', busy = false;
let lastDevBub = null;

function connect() {
  ws = new WebSocket('ws://' + location.host);

  ws.onopen = () => {
    clearTimeout(retryT);
    pulse.className = 'pulse on';
    pill.textContent = 'Live'; pill.className = 'pill live';
  };
  ws.onclose = () => {
    pulse.className = 'pulse';
    pill.textContent = 'Offline'; pill.className = 'pill';
    retryT = setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();

  ws.onmessage = ({data}) => {
    const {type, text} = JSON.parse(data);

    if (type === 'stderr') {
      const t = text.trim(); if (!t) return;
      onDevice(t); return;
    }
    if (type === 'stdout') {
      agentTxt += text;
      if (!agentEl) agentEl = mkAgent('');
      const bub = agentEl.querySelector('.bub');
      bub.textContent = agentTxt.trim();
      if (/signed on ledger|signature:/i.test(agentTxt)) bub.className='bub ok';
      else if (/cancelled|error|failed/i.test(agentTxt)) bub.className='bub err';
      scrollEnd(); return;
    }
    if (type === 'done') {
      setBusy(false);
      agentEl = null; agentTxt = '';
      dsText.textContent = 'READY';
      dsDot.style.background = 'var(--teal)';
      dsDot.style.boxShadow = '0 0 6px var(--teal)';
      refresh();
    }
  };
}

function setBusy(b) {
  busy = b;
  sbtnEl.disabled = b;
  cmdEl.disabled = b;
}

function send() {
  const cmd = cmdEl.value.trim();
  if (!cmd || busy || ws?.readyState !== 1) return;
  hideWelcome();
  mkUser(cmd);
  cmdEl.value = '';
  setBusy(true);
  agentEl = null; agentTxt = ''; lastDevBub = null;
  dsText.textContent = 'WORKING…';
  ws.send(JSON.stringify({command: cmd}));
}
cmdEl.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

function onDevice(text) {
  if (lastDevBub && isAtEnd(lastDevBub)) {
    lastDevBub.textContent += '\n' + text;
    scrollEnd(); return;
  }
  lastDevBub = mkDevice(text);

  if (/approve|sign.*tx|sign.*tran/i.test(text)) {
    dsText.textContent = 'AWAITING APPROVAL';
    dsDot.style.background = 'var(--amber)';
    dsDot.style.boxShadow = '0 0 8px var(--amber)';
  } else if (/web3 check/i.test(text)) {
    dsText.textContent = 'WEB3 CHECK PROMPT';
    dsDot.style.background = 'var(--amber)';
    dsDot.style.boxShadow = '0 0 8px var(--amber)';
  }
}

function isAtEnd(el) {
  const last = msgsEl.lastElementChild;
  return last && last.contains && last.contains(el);
}

async function btn(b) {
  await fetch('/api/button/' + b, {method:'POST'});
  lastDevBub = null;
  setTimeout(refresh, 250);
  setTimeout(refresh, 650);
}

function fill(t) {
  hideWelcome();
  cmdEl.value = t; cmdEl.focus();
}

function hideWelcome() {
  if (welcome) welcome.style.display = 'none';
}

function refresh() {
  screen.src = '/api/screenshot?t=' + Date.now();
}
setInterval(refresh, 650);

// DOM builders
function mkUser(text) {
  lastDevBub = null;
  const d = document.createElement('div');
  d.className = 'msg msg-u';
  d.innerHTML = \`<div class="bub">\${esc(text)}</div>\`;
  msgsEl.appendChild(d); scrollEnd(); return d;
}
function mkAgent(text) {
  lastDevBub = null;
  const d = document.createElement('div');
  d.className = 'msg msg-a';
  d.innerHTML = \`
    <div class="a-hd"><div class="a-av">A</div>agent</div>
    <div class="bub">\${esc(text)}</div>\`;
  msgsEl.appendChild(d); scrollEnd(); return d;
}
function mkDevice(text) {
  const d = document.createElement('div');
  d.className = 'msg msg-d';
  d.innerHTML = \`
    <div class="d-row">
      <div class="d-ic">⬡</div>
      <div class="d-bub">\${esc(text)}</div>
    </div>\`;
  msgsEl.appendChild(d); scrollEnd();
  return d.querySelector('.d-bub');
}
function scrollEnd() {
  requestAnimationFrame(() => { msgsEl.scrollTop = msgsEl.scrollHeight; });
}
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

connect();
</script>
</body>
</html>`;
