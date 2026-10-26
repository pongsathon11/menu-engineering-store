import { PLANS, priceOf, siteOrigin, stripe, randomRef, configured, findOrder, htmlPage } from '../../lib/store.js';

/* GET /api/checkout?plan=basic|pro              →  Stripe Checkout (PromptPay + cards)
   GET /api/checkout?plan=upgrade&from=<ref>     →  Basic → Pro upgrade, pays only the price difference */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const req = url.searchParams.get('plan');
  const origin = siteOrigin(env, request);
  if (!PLANS[req] && req !== 'upgrade') return Response.redirect(origin + '/sale.html#pricing', 302);
  if (!configured(env)) return htmlPage('ร้านยังไม่เปิด', '<h2>ระบบชำระเงินยังไม่พร้อม</h2><p>ร้านกำลังตั้งค่าระบบ กรุณาลองใหม่ภายหลัง</p><p><a href="/sale.html">กลับหน้าหลัก</a></p>', 503);

  let plan = req, amount, name, extra = {};
  if (req === 'upgrade') {
    const from = url.searchParams.get('from') || '';
    let prev = null;
    try { prev = /^[a-f0-9]{32}$/.test(from) ? await findOrder(env, { ref: from }) : null; } catch (e) { prev = null; }
    if (!prev || !prev.paid || prev.plan !== 'basic')
      return htmlPage('อัปเกรดไม่ได้', '<h2>ไม่พบการซื้อเวอร์ชัน Basic ที่ใช้อัปเกรดได้</h2><p>กรุณาเปิดลิงก์ดาวน์โหลดเดิมจากอีเมลใบแจ้งหนี้ แล้วกดปุ่มอัปเกรดจากหน้านั้น (ถ้าเพิ่งซื้อ รอ 1–2 นาทีแล้วลองใหม่)</p><p><a href="/sale.html#pricing">กลับไปหน้าราคา</a></p>', 400);
    plan = 'pro';
    amount = Math.max(20, priceOf('pro', env) - priceOf('basic', env));
    name = 'อัปเกรด Menu Engineering System: Basic → Pro';
    extra = { 'metadata[upgraded_from]': from, 'payment_intent_data[metadata][upgraded_from]': from };
  } else {
    amount = priceOf(plan, env);
    name = PLANS[plan].name;
  }

  const ref = randomRef();
  const dl = `${origin}/thanks.html?ref=${ref}`;
  const days = +env.DOWNLOAD_DAYS || 365;
  const params = {
    mode: 'payment',
    locale: 'th',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'thb',
    'line_items[0][price_data][unit_amount]': String(amount * 100),
    'line_items[0][price_data][product_data][name]': name,
    'line_items[0][price_data][product_data][description]': 'ไฟล์ HTML ใช้งานแบบ offline + คู่มือการใช้งาน (PDF) · สิทธิ์ใช้งาน 1 ร้าน · อัปเดต v2.x ฟรี',
    success_url: `${origin}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/sale.html#pricing`,
    allow_promotion_codes: 'true',
    'branding_settings[display_name]': env.BRAND_NAME || 'datason',
    'branding_settings[button_color]': '#ff7a30',
    'metadata[plan]': plan,
    'metadata[ref]': ref,
    'payment_intent_data[metadata][plan]': plan,
    'payment_intent_data[metadata][ref]': ref,
    'payment_intent_data[description]': name,
    ...extra,
  };
  if (env.INVOICE_LINK !== '0') {
    params['invoice_creation[enabled]'] = 'true';
    params['invoice_creation[invoice_data][description]'] = name;
    params['invoice_creation[invoice_data][footer]'] = `ดาวน์โหลดโปรแกรมและคู่มือการใช้งานได้ที่ ${dl} (ใช้ได้ ${days} วัน) · Download the app and user manual: ${dl}`;
    if (dl.length <= 140) {
      params['invoice_creation[invoice_data][custom_fields][0][name]'] = 'Download';
      params['invoice_creation[invoice_data][custom_fields][0][value]'] = dl;
    }
  }
  try {
    const s = await stripe(env, 'POST', '/checkout/sessions', params);
    return Response.redirect(s.url, 303);
  } catch (e) {
    return htmlPage('เกิดข้อผิดพลาด', `<h2>เปิดหน้าชำระเงินไม่สำเร็จ</h2><p>กรุณาลองใหม่อีกครั้ง</p><p style="color:#888;font-size:12px">${String(e.message).replace(/[<>&]/g, '')}</p><p><a href="/sale.html#pricing">กลับไปหน้าราคา</a></p>`, 502);
  }
}
