import { api } from '../lib/api.js';
import { ok, err } from '../lib/format.js';

export async function deleteApp(id, { confirm }) {
  if (!id) err('<id> is required');
  if (!confirm) err('Pass --confirm to permanently delete an app.');
  const d = await api.delete(`/apps/${id}`);
  ok(`App "${d.name}" permanently deleted.`);
}

export async function deleteDatabase(id, { confirm }) {
  if (!id) err('<id> is required');
  if (!confirm) err('Pass --confirm to permanently delete a database (data is unrecoverable).');
  const d = await api.delete(`/databases/${id}`);
  ok(`Database "${d.name}" permanently deleted.`);
}
