import { api } from '../lib/api.js';
import { table, bold, dim } from '../lib/format.js';

export async function listApps() {
  const { apps } = await api.get('/apps');
  bold('  Running Apps');
  if (!apps.length) { dim('  (none)'); } else {
    table(apps.map(a => ({
      id: a.id.split('-')[0], name: a.name, status: a.status, plan: a.plan_id, url: a.url
    })));
  }
  console.log('');
}

export async function listDatabases() {
  const { databases } = await api.get('/databases');
  bold('  Databases');
  if (!databases.length) { dim('  (none)'); } else {
    table(databases.map(d => ({
      id: d.id.split('-')[0], name: d.name, status: d.status, plan: d.plan_id, host: d.host
    })));
  }
  console.log('');
}
