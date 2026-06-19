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
  delete: (path)       => request('DELETE', path),
};
