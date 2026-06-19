import { api } from '../lib/api.js';
import { ok, err } from '../lib/format.js';
import chalk from 'chalk';

const POLL_INTERVAL = 4000;
const MAX_WAIT = 5 * 60 * 1000; // 5 minutes

export async function waitApp(id) {
  if (!id) err('<id> is required (use: wrexer wait app <id>)');

  const start = Date.now();
  process.stdout.write(`   Waiting for app ${chalk.cyan(id)} to be running`);

  while (Date.now() - start < MAX_WAIT) {
    const { apps } = await api.get('/apps');
    const app = apps.find(a => a.id === id || a.id.startsWith(id));

    if (!app) { console.log(''); err(`App ${id} not found.`); }

    if (app.status === 'running') {
      console.log('');
      ok(`${app.name} is running!`);
      console.log(`   URL: ${chalk.cyan(app.url)}`);
      console.log('');
      return;
    }
    if (app.status === 'failed') {
      console.log('');
      err(`App ${app.name} failed to start. Check logs.`);
    }

    process.stdout.write(chalk.gray('.'));
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  console.log('');
  err('Timed out waiting for app to start (5 minutes). Check dashboard for details.');
}
