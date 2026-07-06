import { api, resolveAppId, resolveDbId } from '../lib/api.js';
import { ok, err } from '../lib/format.js';

export async function stopApp(nameOrId) {
  if (!nameOrId) err('<name|id> is required');
  // Note: stopApp is intentionally disabled for normal apps — only databases support stop.
  // Resolving here anyway so the error from the backend is clear.
  const id = await resolveAppId(nameOrId);
  const d = await api.post(`/apps/${id}/stop`, {});
  ok(`App "${d.name}" stopped. Storage billing continues if applicable.`);
}

export async function stopDatabase(nameOrId) {
  if (!nameOrId) err('<name|id> is required');
  const id = await resolveDbId(nameOrId);
  const d = await api.post(`/databases/${id}/stop`, {});
  ok(`Database "${d.name}" stopped. Storage billing continues.`);
}
