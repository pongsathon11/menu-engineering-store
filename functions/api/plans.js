import { PLANS, priceMode, json } from '../../lib/store.js';

/* GET /api/plans → current prices (single source of truth for the sale page) */
export async function onRequestGet({ env }) {
  const mode = priceMode(env);
  const plans = {};
  for (const [k, p] of Object.entries(PLANS)) plans[k] = { name: p.name, price: p[mode], regular: p.regular };
  return new Response(JSON.stringify({ currency: 'THB', mode, plans }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } });
}
