#!/usr/bin/env node
/**
 * wrexer.js — Main CLI entrypoint
 * Installed as /usr/local/bin/wrexer inside the OpenClaw pod.
 * Usage: wrexer <command> [options]
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { context }                    from './commands/context.js';
import { estimate }                   from './commands/estimate.js';
import { deploy }                     from './commands/deploy.js';
import { dbCreate, dbCreds }          from './commands/database.js';
import { listApps, listDatabases }    from './commands/list.js';
import { stopApp, stopDatabase }      from './commands/stop.js';
import { deleteApp, deleteDatabase }  from './commands/delete.js';
import { waitApp }                    from './commands/wait.js';
import { err } from './lib/format.js';

const cli = yargs(hideBin(process.argv))
  .scriptName('wrexer')
  .usage('$0 <command> [options]')
  .strict()

  // ── context ──────────────────────────────────────────────────────────────
  .command('context', 'Show tenant balance, apps, and databases', {}, async () => {
    await context().catch(e => err(e.message));
  })

  // ── estimate ─────────────────────────────────────────────────────────────
  .command('estimate', 'Get cost estimate before deploying', y => y
    .option('app', { alias: 'a', type: 'string', describe: 'App plan (tiny|small|basic|medium|large|xlarge)', demandOption: true })
    .option('db',  { alias: 'd', type: 'string', describe: 'DB plan  (db-small|db-medium|db-large)' })
  , async argv => {
    await estimate(argv).catch(e => err(e.message));
  })

  // ── deploy ────────────────────────────────────────────────────────────────
  .command('deploy', 'Deploy a Docker image as an app instance', y => y
    .option('name',  { alias: 'n', type: 'string', describe: 'App name (lowercase, hyphens)', demandOption: true })
    .option('image', { alias: 'i', type: 'string', describe: 'Docker image (e.g. user/app:1.0)', demandOption: true })
    .option('port',  { alias: 'p', type: 'number', describe: 'Port your container listens on', demandOption: true })
    .option('plan',  { type: 'string', describe: 'Plan ID (default: small)', default: 'small' })
  , async argv => {
    await deploy(argv).catch(e => err(e.message));
  })

  // ── db ────────────────────────────────────────────────────────────────────
  .command('db <action> [id]', 'Manage databases', y => y
    .positional('action', { choices: ['create', 'creds'], describe: 'create | creds' })
    .positional('id',     { type: 'string', describe: 'Database ID (for creds)' })
    .option('name', { alias: 'n', type: 'string', describe: 'Database name (for create)' })
    .option('plan', { type: 'string', describe: 'DB plan (default: db-small)', default: 'db-small' })
  , async argv => {
    if (argv.action === 'create') await dbCreate(argv).catch(e => err(e.message));
    else if (argv.action === 'creds') await dbCreds(argv.id).catch(e => err(e.message));
    else err(`Unknown db action: ${argv.action}`);
  })

  // ── list ──────────────────────────────────────────────────────────────────
  .command('list <resource>', 'List resources', y => y
    .positional('resource', { choices: ['apps', 'dbs'], describe: 'apps | dbs' })
  , async argv => {
    if (argv.resource === 'apps') await listApps().catch(e => err(e.message));
    else await listDatabases().catch(e => err(e.message));
  })

  // ── stop ──────────────────────────────────────────────────────────────────
  .command('stop <resource> <id>', 'Stop an app or database', y => y
    .positional('resource', { choices: ['app', 'db'], describe: 'app | db' })
    .positional('id',       { type: 'string', describe: 'Resource ID' })
  , async argv => {
    if (argv.resource === 'app') await stopApp(argv.id).catch(e => err(e.message));
    else await stopDatabase(argv.id).catch(e => err(e.message));
  })

  // ── delete ────────────────────────────────────────────────────────────────
  .command('delete <resource> <id>', 'Permanently delete an app or database', y => y
    .positional('resource', { choices: ['app', 'db'], describe: 'app | db' })
    .positional('id',       { type: 'string', describe: 'Resource ID' })
    .option('confirm',      { type: 'boolean', describe: 'Required to confirm deletion', default: false })
  , async argv => {
    if (argv.resource === 'app') await deleteApp(argv.id, argv).catch(e => err(e.message));
    else await deleteDatabase(argv.id, argv).catch(e => err(e.message));
  })

  // ── wait ──────────────────────────────────────────────────────────────────
  .command('wait <resource> <id>', 'Wait until a resource is running', y => y
    .positional('resource', { choices: ['app'], describe: 'app' })
    .positional('id',       { type: 'string', describe: 'App ID' })
  , async argv => {
    await waitApp(argv.id).catch(e => err(e.message));
  })

  .demandCommand(1, 'Please specify a command. Run wrexer --help for usage.')
  .help()
  .alias('h', 'help')
  .version('1.0.0');

cli.parse();
