import { api } from '../lib/api.js';
import { ok, err, info } from '../lib/format.js';
import chalk from 'chalk';

const VALID_DB_PLANS = ['db-small', 'db-medium', 'db-large', 'small', 'medium', 'large'];

export async function dbCreate({ name, plan = 'db-small' }) {
  if (!name) err('--name is required');

  const planId = plan.startsWith('db-') ? plan : `db-${plan}`;
  if (!VALID_DB_PLANS.includes(plan) && !VALID_DB_PLANS.includes(planId)) {
    err(`Unknown db plan "${plan}". Valid: db-small, db-medium, db-large`);
  }

  info(`Provisioning database ${chalk.white.bold(name)} (${planId})…`);
  const d = await api.post('/database', { name, planId });

  ok('Database provisioning!');
  info(`DB ID:    ${d.id}`);
  info(`Host:     ${d.host}`);
  info(`Port:     ${d.port}`);
  info(`DB Name:  ${d.db_name}`);
  info(`DB User:  ${d.db_user}`);
  info(`Password: (use: wrexer db creds ${d.id})`);
  console.log('');
}

export async function dbCreds(id) {
  if (!id) err('<id> is required (use: wrexer db creds <id>)');
  const d = await api.get(`/databases/${id}/creds`);

  console.log('');
  info(`DATABASE_URL=${chalk.white(d.database_url)}`);
  info(`Host:        ${d.host}`);
  info(`Port:        ${d.port}`);
  info(`User:        ${d.db_user}`);
  info(`Password:    ${d.db_password}`);
  info(`DB Name:     ${d.db_name}`);
  console.log('');
}
