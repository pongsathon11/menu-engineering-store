/* Shared helpers for the store's Cloudflare Pages Functions.
   Env vars (Cloudflare Pages → Settings → Variables and Secrets):
     STRIPE_SECRET_KEY  (secret)  sk_test_… while testing, sk_live_… when selling
     PRODUCT_KEY        (secret)  base64 AES-256 key that decrypts /products/*.enc
     PRICE_MODE         launch | regular   (default: launch)
     DOWNLOAD_DAYS      how long a download link works (default: 365)
     SITE_URL           optional, e.g. https://menu-engineering-store.pages.dev
     INVOICE_LINK       1 = also put the download link on the Stripe invoice e-mail (default 1, costs 0.4%) */

export const PLANS = {
  basic: { name: 'Menu Engineering System — Basic', regular: 590, launch: 390, file: 'basic', filename: 'MenuEngineering_Basic.html' },
  pro:   { name: 'Menu Engineering System — Pro',   regular: 1490, launch: 990, file: 'pro',   filename: 'MenuEngineering_Pro.html' },
};

export const priceMode = env => (env.PRICE_MODE === 'regular' ? 'regular' : 'launch');
export const priceOf = (plan, env) => PLANS[plan][priceMode(env)];
export const siteOrigin = (env, request) => (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export function configured(env) { return !!(env.STRIPE_SECRET_KEY && env.PRODUCT_KEY); }

export async function stripe(env, method, path, params) {
  const base = (env.STRIPE_API_BASE || 'https://api.stripe.com') + '/v1';
  const headers = { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY };
  let url = base + path, body;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (method === 'GET') url += '?' + qs;
    else { body = qs; headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  }
  const r = await fetch(url, { method, headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || 'Stripe HTTP ' + r.status);
  return j;
}

export function randomRef() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* Look up an order by Checkout Session id (right after payment) or by ref (link in the e-mail). */
export async function findOrder(env, { sessionId, ref }) {
  if (sessionId) {
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(sessionId)) return null;
    const s = await stripe(env, 'GET', '/checkout/sessions/' + sessionId);
    return { paid: s.payment_status === 'paid', open: s.status === 'open', plan: s.metadata?.plan, email: s.customer_details?.email || '', ref: s.metadata?.ref || '', created: s.created };
  }
  if (ref) {
    if (!/^[a-f0-9]{32}$/.test(ref)) return null;
    const r = await stripe(env, 'GET', '/payment_intents/search', { query: `metadata['ref']:'${ref}'`, 'expand[]': 'data.latest_charge' });
    const list = r.data || [];
    const pi = list.find(x => x.status === 'succeeded') || list[0];
    if (!pi) return { paid: false, pending: true, ref };
    const email = pi.receipt_email || pi.latest_charge?.billing_details?.email || '';
    return { paid: pi.status === 'succeeded', plan: pi.metadata?.plan, email, ref, created: pi.created };
  }
  return null;
}

export function expired(order, env) {
  const days = +env.DOWNLOAD_DAYS || 365;
  return order.created && (Date.now() / 1000 - order.created) > days * 86400;
}

export const maskEmail = e => {
  if (!e || !e.includes('@')) return '';
  const [u, d] = e.split('@');
  return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***' + u.slice(-1)) + '@' + d;
};

/* ---------- product file: decrypt (AES-256-GCM, iv|ciphertext|tag) + stamp licensee ---------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function loadProduct(env, request, plan) {
  const P = PLANS[plan];
  const origin = new URL(request.url).origin;
  const [encRes, manRes] = await Promise.all([
    env.ASSETS.fetch(new URL('/products/' + P.file + '.enc', origin)),
    env.ASSETS.fetch(new URL('/products/manifest.json', origin)),
  ]);
  if (!encRes.ok || !manRes.ok) throw new Error('product file missing');
  const buf = new Uint8Array(await encRes.arrayBuffer());
  const manifest = await manRes.json();
  const key = await crypto.subtle.importKey('raw', b64(env.PRODUCT_KEY), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)));
  return { bytes: plain, slot: manifest[P.file] };
}
export function stampLicensee(bytes, slot, email) {
  if (!slot || typeof slot.offset !== 'number') return bytes;
  const clean = String(email || '').replace(/[^A-Za-z0-9@._+-]/g, '').slice(0, slot.len) || 'customer';
  const padded = clean.padEnd(slot.len, ' ');
  for (let i = 0; i < slot.len; i++) bytes[slot.offset + i] = padded.charCodeAt(i);
  return bytes;
}

export function htmlPage(title, bodyHtml, status = 200) {
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#f4f6fa;color:#1c2333;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.box{background:#fff;border-radius:14px;padding:28px;max-width:440px;box-shadow:0 6px 18px rgba(20,30,55,.08);text-align:center;line-height:1.7}a{color:#ff7a30}</style></head>
<body><div class="box">${bodyHtml}</div></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
