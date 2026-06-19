import { api } from '../lib/api.js';
import { bold, info, dim, table } from '../lib/format.js';
import chalk from 'chalk';

export async function context() {
  const d = await api.get('/context');

  console.log('');
  bold('  Wrexer Tenant Context');
  console.log(chalk.gray('  ────────────────────────────────────────'));
  info(`Balance:    ${chalk.white.bold(d.balance_display)}`);
  info(`Namespace:  ${d.namespace}`);
  if (d.docker_username) info(`Docker:     ${d.docker_username}`);
  console.log('');

  bold('  Apps');
  table(d.apps.map(a => ({ id: a.id.split('-')[0], name: a.name, status: a.status, plan: a.plan_id, url: a.url })));
  console.log('');

  bold('  Databases');
  table(d.databases.map(db => ({ id: db.id.split('-')[0], name: db.name, status: db.status, plan: db.plan_id, host: db.host })));
  console.log('');

  bold('  Available Plans');
  table(d.plans.filter(p => !p.id.startsWith('p-kata')).map(p => ({
    id: p.id, name: p.name, cpu: p.cpu, memory: p.memory, price: p.price_display, storage: p.storage || '-'
  })));
  console.log('');
}
