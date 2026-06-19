import { api } from '../lib/api.js';
import { ok, err } from '../lib/format.js';

export async function stopApp(id) {
  if (!id) err('<id> is required');
  const d = await api.post(`/apps/${id}/stop`, {});
  ok(`App "${d.name}" stopped. Storage billing continues if applicable.`);
}

export async function stopDatabase(id) {
  if (!id) err('<id> is required');
  const d = await api.post(`/databases/${id}/stop`, {});
  ok(`Database "${d.name}" stopped. Storage billing continues.`);
}
