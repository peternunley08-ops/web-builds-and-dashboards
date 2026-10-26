/**
 * Fire a fake order at the deployed Apps Script endpoint to verify the pipeline.
 * Usage:  node test-order.js "https://script.google.com/macros/s/XXXX/exec"
 *
 * Mirrors exactly what the storefront form sends (JSON body, text/plain content-type
 * so the browser skips the CORS preflight). Node 18+ (global fetch) required.
 */
const url = process.argv[2];
if (!url || !/^https:\/\/script\.google\.com\/.*\/exec$/.test(url)) {
  console.error('Pass your deployed /exec URL:\n  node test-order.js "https://script.google.com/macros/s/XXXX/exec"');
  process.exit(1);
}

// Tiny valid 1x1 PNG as a data URL (stands in for the uploaded pet photo).
const photo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';

const payload = {
  customer_name:  'Test Customer',
  customer_email: 'customer@example.com',
  pet_name:       'Luna',
  selected_style: 'Vintage Oil',
  pet_photo:      photo
};

(async () => {
  console.log('POST →', url);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  const text = await resp.text();
  console.log('HTTP', resp.status);
  console.log(text);
  try {
    const j = JSON.parse(text);
    console.log(j.ok ? `\n✅ OK — order ${j.order_id}. Check the Sheet, Drive, and your inbox.`
                     : `\n❌ Backend said: ${j.error}`);
  } catch { console.log('\n(Response was not JSON — check the deployment access settings.)'); }
})().catch(e => { console.error('Request failed:', e.message); process.exit(1); });
