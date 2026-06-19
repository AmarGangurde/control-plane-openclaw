/**
 * app.js — WebSocket chat client for the OpenClaw UI.
 * Handles streaming, tool execution blocks, and history display.
 */

const msgs     = document.getElementById('messages');
const input    = document.getElementById('input');
const sendBtn  = document.getElementById('sendBtn');
const statusDot = document.getElementById('statusDot');

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${location.host}/ws`;
let ws, currentBubble = null, busy = false;

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    statusDot.style.background = '#10b981';
    statusDot.title = 'Connected';
  };

  ws.onclose = () => {
    statusDot.style.background = '#ef4444';
    statusDot.title = 'Disconnected — reconnecting…';
    setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    statusDot.style.background = '#f59e0b';
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMsg(msg);
  };
}

// ── Message rendering ─────────────────────────────────────────────────────────
function handleMsg(msg) {
  switch (msg.type) {
    case 'thinking':
      removeThinking();
      appendThinking();
      break;

    case 'stream':
      removeThinking();
      if (!currentBubble) currentBubble = appendAgentBubble('');
      currentBubble.textContent += msg.content;
      scrollBottom();
      break;

    case 'stream_end':
      currentBubble = null;
      break;

    case 'cmd_start':
      removeThinking();
      currentBubble = null;
      appendToolBlock(msg.command, null, 'run');
      scrollBottom();
      break;

    case 'cmd_result':
      updateLastToolBlock(msg.output, msg.exitCode === 0 ? 'ok' : 'err');
      scrollBottom();
      break;

    case 'error':
      removeThinking();
      currentBubble = null;
      appendError(msg.content);
      setBusy(false);
      break;

    case 'done':
      removeThinking();
      currentBubble = null;
      setBusy(false);
      break;
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function appendUserMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `<span class="label">You</span><div class="bubble">${escHtml(text)}</div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function appendAgentBubble(text) {
  const div = document.createElement('div');
  div.className = 'msg agent';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  div.innerHTML = `<span class="label">OpenClaw</span>`;
  div.appendChild(bubble);
  msgs.appendChild(div);
  scrollBottom();
  return bubble;
}

function appendThinking() {
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.id = 'thinking';
  div.innerHTML = `<span class="label">OpenClaw</span>
    <div class="thinking">
      <div class="dots"><span></span><span></span><span></span></div>
      <span>Thinking…</span>
    </div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function removeThinking() {
  const el = document.getElementById('thinking');
  if (el) el.remove();
}

let lastToolBlock = null;
function appendToolBlock(cmd, output, status) {
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.innerHTML = `<span class="label">Tool</span>`;
  const block = document.createElement('div');
  block.className = 'tool-block';
  block.innerHTML = `
    <div class="tool-header">
      <span>$</span>
      <span class="cmd">${escHtml(cmd)}</span>
      <span class="badge ${status}">${status === 'run' ? 'running…' : status === 'ok' ? 'exit 0' : 'error'}</span>
    </div>
    ${output !== null ? `<div class="tool-output">${escHtml(output)}</div>` : ''}
  `;
  div.appendChild(block);
  msgs.appendChild(div);
  lastToolBlock = block;
  scrollBottom();
}

function updateLastToolBlock(output, status) {
  if (!lastToolBlock) return;
  const badge = lastToolBlock.querySelector('.badge');
  if (badge) { badge.className = `badge ${status}`; badge.textContent = status === 'ok' ? 'exit 0' : 'error'; }
  let outEl = lastToolBlock.querySelector('.tool-output');
  if (!outEl) {
    outEl = document.createElement('div');
    outEl.className = 'tool-output';
    lastToolBlock.appendChild(outEl);
  }
  outEl.textContent = output;
}

function appendError(text) {
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.innerHTML = `<span class="label">Error</span><div class="bubble" style="border-color:#ef4444;color:#fca5a5">${escHtml(text)}</div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function scrollBottom() {
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Send ──────────────────────────────────────────────────────────────────────
function setBusy(b) {
  busy = b;
  sendBtn.disabled = b;
  input.disabled = b;
}

function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  appendUserMsg(text);
  input.value = '';
  input.style.height = 'auto';
  setBusy(true);
  ws.send(JSON.stringify({ message: text }));
}

sendBtn.addEventListener('click', send);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
});

// ── Welcome message ───────────────────────────────────────────────────────────
function showWelcome() {
  const bubble = appendAgentBubble('');
  bubble.innerHTML = `
    👋 <strong>Welcome to your OpenClaw Workspace!</strong><br><br>
    I'm your AI infrastructure assistant. I can help you:<br>
    • Build and deploy applications<br>
    • Provision databases<br>
    • Manage your Wrexer resources<br><br>
    <em>What would you like to build today?</em>
  `;
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    if (history && history.length > 0) {
      msgs.innerHTML = ''; // clear any existing messages
      history.forEach(entry => {
        if (entry.role === 'user') {
          appendUserMsg(entry.content);
        } else if (entry.role === 'assistant') {
          // Check if it's a tool execution block or just text.
          // For simplicity, just render it as an agent bubble.
          // <wrexer> tags might be visible in the text, which is fine for history.
          const bubble = appendAgentBubble('');
          bubble.textContent = entry.content;
        }
      });
    } else {
      showWelcome();
    }
  } catch (err) {
    console.error('Failed to load history:', err);
    showWelcome();
  }
}

connect();
loadHistory();
