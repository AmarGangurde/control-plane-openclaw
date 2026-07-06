import { api, resolveAppId } from '../lib/api.js';
import { ok, err, info } from '../lib/format.js';
import chalk from 'chalk';

const VALID_PLANS = ['tiny', 'small', 'basic', 'medium', 'large', 'xlarge',
                     'p-tiny', 'p-small', 'p-basic', 'p-medium', 'p-large', 'p-xlarge'];

/**
 * wrexer update app <name> --image <image> [--port <port>] [--env KEY=VALUE]
 *
 * Updates a running app in-place. Use this when:
 *   - wrexer deploy returns a 409 (app already exists)
 *   - You want to push a new image to an existing deployment
 */
export async function updateApp({ nameOrId, image, port, plan, env }) {
  if (!nameOrId) err('<name|id> is required');

  info(`Resolving app "${nameOrId}"...`);
  const id = await resolveAppId(nameOrId);

  const planId = plan ? (plan.startsWith('p-') ? plan : `p-${plan}`) : undefined;
  if (planId && !VALID_PLANS.includes(plan) && !VALID_PLANS.includes(planId)) {
    err(`Unknown plan "${plan}". Valid: tiny, small, basic, medium, large, xlarge`);
  }

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

  const body = {};
  if (image) body.image = image;
  if (port)  body.port  = parseInt(port, 10);
  if (planId) body.planId = planId;
  if (envArray) body.env = envArray;

  if (Object.keys(body).length === 0) {
    err('At least one of --image, --port, --plan, or --env must be provided.');
  }

  info(`Updating ${chalk.white.bold(nameOrId)}...`);
  const d = await api.patch(`/apps/${id}`, body);

  ok(`App "${d.name || nameOrId}" updated successfully!`);
  if (d.url) info(`URL: ${chalk.cyan(d.url)}`);
  info(`Run: wrexer wait app ${nameOrId}`);
  console.log('');
}
