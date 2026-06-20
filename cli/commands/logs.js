import { api } from '../lib/api.js';
import { err } from '../lib/format.js';
import chalk from 'chalk';

export async function logs(id) {
  if (!id) err('App or Database ID is required');

  console.log(chalk.cyan(`Fetching logs for ${id}...`));
  const data = await api.get(`/apps/${id}/logs`);
  
  if (data.logs) {
    console.log(chalk.gray('--- BEGIN LOGS ---'));
    console.log(data.logs);
    console.log(chalk.gray('--- END LOGS ---'));
  } else {
    console.log(chalk.yellow('No logs available yet.'));
  }
}
