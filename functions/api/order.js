import { PLANS, findOrder, expired, maskEmail, json, configured } from '../../lib/store.js';

/* GET /api/order?session_id=… | ?ref=…  →  payment status for the thank-you page */
export async function onRequestGet({ request, env }) {
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const u = new URL(request.url);
  const sessionId = u.searchParams.get('session_id'), ref = u.searchParams.get('ref');
  try {
    const o = await findOrder(env, { sessionId, ref });
    if (!o) return json({ error: 'invalid' }, 400);
    const P = PLANS[o.plan];
    const q = sessionId ? 'session_id=' + encodeURIComponent(sessionId) : 'ref=' + encodeURIComponent(ref);
    return json({
      paid: !!o.paid && !!P, pending: !o.paid, expired: o.paid ? expired(o, env) : false,
      plan: o.plan || null, planName: P?.name || null, email: maskEmail(o.email),
      downloadUrl: o.paid && P ? '/api/download?' + q : null,
      emailLink: o.ref ? '/thanks.html?ref=' + o.ref : null,
    });
  } catch (e) { return json({ error: 'lookup_failed' }, 502); }
}
