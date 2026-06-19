import { api } from '../lib/api.js';
import { costCard, err } from '../lib/format.js';

export async function estimate({ app, db: dbPlan }) {
  if (!app) { err('--app <plan> is required (e.g. small, basic, medium)'); }
  const data = await api.post('/estimate', { app_plan: app, db_plan: dbPlan || null });
  costCard(data);
  if (!data.balance_ok) process.exit(2);
}
