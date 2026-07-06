/**
 * api.js — HTTP client for the Wrexer Agent API.
 * Reads WREXER_API_URL and WREXER_AGENT_TOKEN from env automatically.
 * All CLI commands use this module — never touch fetch() directly.
 */

import fetch from 'node-fetch';

const BASE = (process.env.WREXER_API_URL || 'https://wrexer.com/api').replace(/\/$/, '');
const TOKEN = process.env.WREXER_AGENT_TOKEN || '';

if (!TOKEN) {
  console.error('ERROR: WREXER_AGENT_TOKEN environment variable is not set.');
  process.exit(1);
}

async function request(method, path, body) {
  const url = `${BASE}/agent${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get:    (path)       => request('GET',    path),
  post:   (path, body) => request('POST',   path, body),
  patch:  (path, body) => request('PATCH',  path, body),
  delete: (path)       => request('DELETE', path),
};

// ── Name resolution helpers ───────────────────────────────────────────────────
// Accept either a UUID or a human-readable name for apps and databases.

export async function resolveAppId(nameOrId) {
  // Already a full UUID — use directly
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) return nameOrId;
  // Short-ID prefix (e.g. first segment of UUID)
  const data = await api.get('/apps');
  const apps = data.apps || data;
  const found = apps.find(a => a.name === nameOrId || a.id.startsWith(nameOrId));
  if (!found) throw new Error(`No app named "${nameOrId}" found. Run: wrexer list apps`);
  return found.id;
}

export async function resolveDbId(nameOrId) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) return nameOrId;
  const data = await api.get('/databases');
  const dbs = data.databases || data;
  const found = dbs.find(d => d.name === nameOrId || d.id.startsWith(nameOrId));
  if (!found) throw new Error(`No database named "${nameOrId}" found. Run: wrexer list dbs`);
  return found.id;
}

