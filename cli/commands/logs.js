import { api, resolveAppId } from '../lib/api.js';
import { err } from '../lib/format.js';
import chalk from 'chalk';

export async function logs(nameOrId) {
  if (!nameOrId) err('App or Database name/ID is required');

  console.log(chalk.cyan(`Fetching logs for ${nameOrId}...`));
  const id = await resolveAppId(nameOrId).catch(() => nameOrId); // fallback to raw value if resolution fails (could be a DB short ID)
  const data = await api.get(`/apps/${id}/logs`);

  if (data.logs) {
    console.log(chalk.gray('--- BEGIN LOGS ---'));
    console.log(data.logs);
    console.log(chalk.gray('--- END LOGS ---'));
  } else {
    console.log(chalk.yellow('No logs available yet.'));
  }
}
