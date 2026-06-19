import { api } from '../lib/api.js';
import { ok, err, info } from '../lib/format.js';
import chalk from 'chalk';

const VALID_PLANS = ['tiny', 'small', 'basic', 'medium', 'large', 'xlarge',
                     'p-tiny', 'p-small', 'p-basic', 'p-medium', 'p-large', 'p-xlarge'];

export async function deploy({ name, image, port, plan = 'small', env }) {
  if (!name)  err('--name is required');
  if (!image) err('--image is required');
  if (!port)  err('--port is required');

  if (!/^[a-z0-9][a-z0-9-]{0,60}[a-z0-9]$/.test(name)) {
    err('--name must be lowercase letters, numbers, and hyphens (e.g. my-api)');
  }
  if (isNaN(parseInt(port)) || port < 1 || port > 65535) {
    err('--port must be a number between 1 and 65535');
  }

  const planId = plan.startsWith('p-') ? plan : `p-${plan}`;
  if (!VALID_PLANS.includes(plan) && !VALID_PLANS.includes(planId)) {
    err(`Unknown plan "${plan}". Valid: tiny, small, basic, medium, large, xlarge`);
  }

  info(`Deploying ${chalk.white.bold(name)} (${image} on port ${port}, plan: ${planId})…`);

  let envArray = null;
  if (env) {
    envArray = [];
    const envs = Array.isArray(env) ? env : [env];
    for (const e of envs) {
      const idx = e.indexOf('=');
      if (idx > 0) {
        envArray.push({ name: e.slice(0, idx), value: e.slice(idx + 1) });
      }
    }
    if (envArray.length === 0) envArray = null;
  }

  const d = await api.post('/deploy', { name, image, port: parseInt(port), planId, env: envArray });

  ok(`Deployed!`);
  info(`App ID:  ${d.appId || d.id}`);
  info(`URL:     ${chalk.cyan(d.url)}`);
  info(`Status:  ${d.status} (run: wrexer wait app ${d.appId || d.id})`);
  console.log('');
}
