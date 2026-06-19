/**
 * format.js — pretty-print helpers for CLI output.
 */

import chalk from 'chalk';

export const ok  = (msg) => console.log(chalk.green('✅ ' + msg));
export const err = (msg) => { console.error(chalk.red('❌ ' + msg)); process.exit(1); };
export const info = (msg) => console.log(chalk.cyan('   ' + msg));
export const dim  = (msg) => console.log(chalk.gray('   ' + msg));
export const bold = (msg) => console.log(chalk.white.bold(msg));

export function table(rows) {
  if (!rows.length) { dim('(none)'); return; }
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const header = cols.map((c, i) => c.toUpperCase().padEnd(widths[i])).join('  ');
  console.log(chalk.gray('   ' + header));
  console.log(chalk.gray('   ' + widths.map(w => '─'.repeat(w)).join('  ')));
  for (const row of rows) {
    const line = cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  ');
    console.log('   ' + line);
  }
}

export function costCard({ app_plan, db_plan, total_display, balance_display, hours_remaining, balance_ok }) {
  console.log('');
  console.log(chalk.yellow('  💰 Cost Estimate'));
  console.log(chalk.gray('  ──────────────────────────────────────────'));
  if (app_plan) console.log(`  App  (${app_plan.name.padEnd(12)})  ${app_plan.display}`);
  if (db_plan)  console.log(`  DB   (${db_plan.name.padEnd(12)})  ${db_plan.display}`);
  console.log(chalk.gray('  ──────────────────────────────────────────'));
  console.log(`  Total:    ${chalk.white.bold(total_display)}`);
  console.log(`  Balance:  ${balance_display}  (${hours_remaining})`);
  if (balance_ok) {
    console.log(chalk.green('  Status:   ✅ OK to proceed'));
  } else {
    console.log(chalk.red('  Status:   ❌ Insufficient balance'));
  }
  console.log('');
}
