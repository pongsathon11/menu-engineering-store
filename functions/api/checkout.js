import { PLANS, priceOf, siteOrigin, stripe, randomRef, configured, htmlPage } from '../../lib/store.js';

/* GET /api/checkout?plan=basic|pro  →  redirect to Stripe Checkout (PromptPay + cards) */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const plan = url.searchParams.get('plan');
  const origin = siteOrigin(env, request);
  if (!PLANS[plan]) return Response.redirect(origin + '/sale.html#pricing', 302);
  if (!configured(env)) return htmlPage('ร้านยังไม่เปิด', '<h2>ระบบชำระเงินยังไม่พร้อม</h2><p>ร้านกำลังตั้งค่าระบบ กรุณาลองใหม่ภายหลัง</p><p><a href="/sale.html">กลับหน้าหลัก</a></p>', 503);
  const P = PLANS[plan];
  const ref = randomRef();
  const dl = `${origin}/thanks.html?ref=${ref}`;
  const params = {
    mode: 'payment',
    locale: 'th',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'thb',
    'line_items[0][price_data][unit_amount]': String(priceOf(plan, env) * 100),
    'line_items[0][price_data][product_data][name]': P.name,
    'line_items[0][price_data][product_data][description]': 'ไฟล์ HTML ใช้งานแบบ offline · สิทธิ์ใช้งาน 1 ร้าน · อัปเดต v2.x ฟรี',
    success_url: `${origin}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/sale.html#pricing`,
    allow_promotion_codes: 'true',
    'metadata[plan]': plan,
    'metadata[ref]': ref,
    'payment_intent_data[metadata][plan]': plan,
    'payment_intent_data[metadata][ref]': ref,
    'payment_intent_data[description]': P.name,
  };
  if (env.INVOICE_LINK !== '0') {
    params['invoice_creation[enabled]'] = 'true';
    params['invoice_creation[invoice_data][description]'] = P.name;
    params['invoice_creation[invoice_data][footer]'] = `ดาวน์โหลดไฟล์ได้ที่ ${dl} (ใช้ได้ ${+env.DOWNLOAD_DAYS || 365} วัน) · Download link: ${dl}`;
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
