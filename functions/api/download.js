import { PLANS, findOrder, expired, loadProduct, stampLicensee, configured, htmlPage } from '../../lib/store.js';

/* GET /api/download?session_id=… | ?ref=…  →  the purchased HTML file, stamped with the buyer's e-mail */
export async function onRequestGet({ request, env }) {
  if (!configured(env)) return htmlPage('ยังไม่พร้อม', '<h2>ระบบยังไม่พร้อม</h2>', 503);
  const u = new URL(request.url);
  let o;
  try { o = await findOrder(env, { sessionId: u.searchParams.get('session_id'), ref: u.searchParams.get('ref') }); }
  catch (e) { return htmlPage('ตรวจสอบไม่สำเร็จ', '<h2>ตรวจสอบคำสั่งซื้อไม่สำเร็จ</h2><p>กรุณาลองใหม่อีกครั้งในไม่กี่นาที</p>', 502); }
  if (!o) return htmlPage('ลิงก์ไม่ถูกต้อง', '<h2>ลิงก์ดาวน์โหลดไม่ถูกต้อง</h2>', 400);
  if (!o.paid || !PLANS[o.plan]) return htmlPage('ยังไม่ได้รับชำระเงิน', '<h2>ยังไม่พบการชำระเงิน</h2><p>ถ้าเพิ่งชำระด้วยพร้อมเพย์ กรุณารอสักครู่แล้วลองใหม่</p>', 402);
  if (expired(o, env)) return htmlPage('ลิงก์หมดอายุ', '<h2>ลิงก์ดาวน์โหลดหมดอายุแล้ว</h2><p>กรุณาติดต่อร้านพร้อมอีเมลที่ใช้ซื้อ</p>', 410);
  try {
    const { bytes, slot } = await loadProduct(env, request, o.plan);
    stampLicensee(bytes, slot, o.email);
    return new Response(bytes, { headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `attachment; filename="${PLANS[o.plan].filename}"`,
      'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  } catch (e) { return htmlPage('เกิดข้อผิดพลาด', '<h2>เตรียมไฟล์ไม่สำเร็จ</h2><p>กรุณาติดต่อร้าน</p>', 500); }
}
