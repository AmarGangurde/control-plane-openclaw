import { api, resolveAppId, resolveDbId } from '../lib/api.js';
import { ok, err } from '../lib/format.js';

export async function deleteApp(nameOrId, { confirm }) {
  if (!nameOrId) err('<name|id> is required');
  if (!confirm) err('Pass --confirm to permanently delete an app.');
  const id = await resolveAppId(nameOrId);
  const d = await api.delete(`/apps/${id}`);
  ok(`App "${d.name}" permanently deleted.`);
}

export async function deleteDatabase(nameOrId, { confirm }) {
  if (!nameOrId) err('<name|id> is required');
  if (!confirm) err('Pass --confirm to permanently delete a database (data is unrecoverable).');
  const id = await resolveDbId(nameOrId);
  const d = await api.delete(`/databases/${id}`);
  ok(`Database "${d.name}" permanently deleted.`);
}
