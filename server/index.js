/**
 * index.js — WrexForge HTTP + WebSocket server on port 18789.
 * Serves the chat UI and handles WebSocket chat sessions.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { handleChat, loadHistory } from './chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '../public');
const PORT = 18789;

// ── Ensure workspace defaults ─────────────────────────────────────────────────
const WORKSPACE = '/workspace';
const DEFAULTS = path.join(__dirname, '../workspace');

async function ensureWorkspaceDefaults() {
  try {
    const files = fs.readdirSync(DEFAULTS);
    for (const f of files) {
      const dest = path.join(WORKSPACE, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(DEFAULTS, f), dest);
        console.log(`Copied workspace default: ${f}`);
      }
    }
    }
  } catch (e) {
    console.warn('Could not copy workspace defaults:', e.message);
  }
}

// ── Docker Auto-Login ─────────────────────────────────────────────────────────
async function ensureDockerLogin() {
  const { DOCKER_USERNAME, DOCKER_PASSWORD } = process.env;
  if (!DOCKER_USERNAME || !DOCKER_PASSWORD) return;

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    console.log(`Attempting automatic docker login for user: ${DOCKER_USERNAME}...`);
    // Wait for docker daemon to be ready (up to 5 seconds)
    for (let i = 0; i < 5; i++) {
      try {
        await execAsync('docker info', { timeout: 1000 });
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    await execAsync(`echo "${DOCKER_PASSWORD}" | docker login -u "${DOCKER_USERNAME}" --password-stdin`, { timeout: 10000 });
    console.log('✅ Docker auto-login successful');
  } catch (e) {
    console.error('❌ Docker auto-login failed:', e.message);
  }
}

// ── HTTP server (serves chat UI) ──────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/history') {
    const history = await loadHistory();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(history));
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(PUBLIC, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Chat session connected');

  ws.on('message', async (raw) => {
    try {
      const { message } = JSON.parse(raw.toString());
      if (!message?.trim()) return;
      await handleChat(ws, message.trim());
    } catch (e) {
      console.error('WebSocket message error:', e.message);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', content: e.message }));
      }
    }
  });

  ws.on('close', () => console.log('Chat session closed'));
  ws.on('error', (e) => console.error('WebSocket error:', e.message));
});

// ── Start ─────────────────────────────────────────────────────────────────────
await ensureWorkspaceDefaults();
await ensureDockerLogin();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`WrexForge workspace running on port ${PORT}`);
  console.log(`API: ${process.env.WREXER_API_URL || 'https://wrexer.com/api'}`);
  console.log(`Namespace: ${process.env.WREXER_NAMESPACE || '(not set)'}`);
});
