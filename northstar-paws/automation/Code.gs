/**
 * Northstar Paws — Order Capture & Production backend
 * =====================================================
 * A single, self-contained Google Apps Script web app that the storefront
 * order form (index.html -> NP_ENDPOINT) posts to. For every incoming order it:
 *
 *   1. CAPTURE  - parses the order, saves the customer's pet photo to Drive,
 *                 and appends a row to the "Orders" Google Sheet (the order book).
 *   2. PRODUCE  - auto-drafts a first-pass AI portrait ("proof") from the photo
 *                 in the chosen style via the Gemini image API, saved to Drive.
 *   3. ALERT    - emails you the full order + the AI proof, ready to refine & send.
 *
 * Everything runs on YOUR Google account. No server, no OpenClaw uptime needed.
 *
 * Config lives in Script Properties (Project Settings -> Script properties),
 * so no secrets are hard-coded. Defaults below let it run before you set them.
 * See SETUP.md for the 10-minute deploy.
 */

// ---- Defaults (overridden by Script Properties of the same name) ----
var DEFAULTS = {
  ALERT_EMAIL:     'orders@example.com',        // where new-order alerts go
  GEMINI_MODEL:    'gemini-2.5-flash-image',   // image-capable Gemini model ("Nano Banana")
  GEMINI_API_KEY:  '',                         // set this to turn on auto-proofs (AI Studio)
  CONFIRM_CUSTOMER:'false',                     // 'true' = also auto-email the customer a confirmation
  TIMEZONE:        'America/Los_Angeles',
  BRAND:           'Northstar Paws',
  // The next three auto-create on first run and store their IDs back into properties:
  SHEET_ID:        '',
  DRIVE_FOLDER_ID: '',
  PROOFS_ENABLED:  'true'                       // 'false' = skip AI proof, capture+alert only
};

var STYLE_PROMPTS = {
  'Vintage Oil':
    'Transform this exact pet into a museum-quality VINTAGE OIL PAINTING portrait. ' +
    'Rich visible brushstrokes, warm classical chiaroscuro lighting, deep painterly background, ' +
    'gilded fine-art feel. Preserve the pet\'s breed, fur colour, markings and expression faithfully. ' +
    'Head-and-shoulders composition. No text, no watermark, no border.',
  'Pop-Art':
    'Transform this exact pet into a bold POP-ART portrait in an Andy-Warhol screenprint style. ' +
    'Flat blocks of vivid saturated colour, high contrast, clean graphic outlines, halftone energy. ' +
    'Preserve the pet\'s breed, markings and expression. Head-and-shoulders. No text, no watermark, no border.',
  'Flat-Illustration':
    'Transform this exact pet into a clean MODERN FLAT VECTOR illustration portrait. ' +
    'Minimal geometric shapes, elegant limited pastel palette, soft gradients, contemporary editorial look. ' +
    'Preserve the pet\'s breed, markings and expression. Head-and-shoulders. No text, no watermark, no border.',
  '_default':
    'Transform this exact pet into a tasteful fine-art portrait while faithfully preserving its ' +
    'breed, fur colour, markings and expression. Head-and-shoulders. No text, no watermark, no border.'
};

var SHEET_HEADERS = [
  'order_id','received_at','status','customer_name','customer_email',
  'pet_name','style','photo_url','proof_url','paid','shipped','notes'
];

// ============================ HTTP entry points ============================

function doGet() {
  // Simple health check / browser-visit landing.
  return json_({ ok: true, service: cfg_('BRAND') + ' order intake', time: now_() });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var o = JSON.parse(raw);

    // ---- validate ----
    var email = String(o.customer_email || '').trim();
    var pet   = String(o.pet_name || '').trim();
    if (!email || !pet || !o.pet_photo) {
      return json_({ ok: false, error: 'Missing email, pet name, or photo.' });
    }
    var style = String(o.selected_style || '_default').trim();
    var name  = String(o.customer_name || '').trim();

    var orderId = makeOrderId_();
    var notes = [];

    // ---- CAPTURE: save the customer's photo to Drive ----
    var folder = orderFolder_(orderId);
    var photo  = dataUrlToBlob_(o.pet_photo, slug_(pet) + '-original');
    var photoUrl = '';
    if (photo) {
      var pf = folder.createFile(photo);
      photoUrl = pf.getUrl();
    } else {
      notes.push('photo could not be decoded');
    }

    // ---- PRODUCE: auto-draft the AI proof from the photo ----
    var proofUrl = '';
    var proofBlob = null;
    var status = 'NEW';
    if (cfg_('PROOFS_ENABLED') === 'true' && photo) {
      var gen = generateProof_(photo, style);
      if (gen.ok) {
        proofBlob = Utilities.newBlob(Utilities.base64Decode(gen.data), gen.mime,
                      slug_(pet) + '-' + slug_(style) + '-PROOF.png');
        var prf = folder.createFile(proofBlob);
        proofUrl = prf.getUrl();
        status = 'PROOF_READY';
      } else {
        proofUrl = '(manual — auto-proof failed)';
        notes.push('proof: ' + gen.reason);
      }
    } else if (cfg_('PROOFS_ENABLED') !== 'true') {
      proofUrl = '(manual)';
    }

    // ---- CAPTURE: append to the order book ----
    appendRow_([
      orderId, now_(), status, name, email,
      pet, style, photoUrl, proofUrl, '', '', notes.join('; ')
    ]);

    // ---- ALERT: email you the order + proof ----
    sendAlert_({
      orderId: orderId, name: name, email: email, pet: pet, style: style,
      photoUrl: photoUrl, proofUrl: proofUrl, status: status, notes: notes.join('; '),
      photoBlob: photo, proofBlob: proofBlob
    });

    // ---- optional: confirm to the customer ----
    if (cfg_('CONFIRM_CUSTOMER') === 'true') {
      confirmCustomer_(email, name, pet, style);
    }

    return json_({ ok: true, order_id: orderId });
  } catch (err) {
    // Never lose an order silently — log to the sheet's notes if we can.
    try { appendRow_(['ERROR', now_(), 'ERROR', '', '', '', '', '', '', '', '', String(err)]); } catch (_) {}
    return json_({ ok: false, error: String(err) });
  }
}

// ============================ Gemini proof ============================

function generateProof_(photoBlob, style) {
  var key = cfg_('GEMINI_API_KEY');
  if (!key) return { ok: false, reason: 'no GEMINI_API_KEY set (capture-only)' };

  var model  = cfg_('GEMINI_MODEL');
  var prompt = STYLE_PROMPTS[style] || STYLE_PROMPTS._default;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

  var body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: photoBlob.getContentType(),
                         data: Utilities.base64Encode(photoBlob.getBytes()) } }
      ]
    }],
    generationConfig: { responseModalities: ['IMAGE'] }
  };

  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200) return { ok: false, reason: 'Gemini HTTP ' + code + ': ' + text.slice(0, 280) };

  var data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, reason: 'bad JSON from Gemini' }; }
  var parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  for (var i = 0; i < parts.length; i++) {
    var inl = parts[i].inlineData || parts[i].inline_data;  // API returns camelCase; accept both
    if (inl && inl.data) return { ok: true, data: inl.data, mime: inl.mimeType || inl.mime_type || 'image/png' };
  }
  return { ok: false, reason: 'no image in Gemini response' };
}

// ============================ Email ============================

function sendAlert_(d) {
  var sheetLink = 'https://docs.google.com/spreadsheets/d/' + cfg_('SHEET_ID');
  var subject = '🐾 New order — ' + d.pet + ' (' + d.style + ') · ' + d.orderId;
  var inline = {};
  var attachments = [];

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px">' +
    '<h2 style="margin:0 0 4px">New ' + esc_(cfg_('BRAND')) + ' order</h2>' +
    '<p style="color:#666;margin:0 0 16px">' + esc_(d.orderId) + ' &middot; ' + esc_(now_()) +
      ' &middot; status <b>' + esc_(d.status) + '</b></p>' +
    '<table cellpadding="6" style="border-collapse:collapse;font-size:14px">' +
    row_('Pet', d.pet) + row_('Style', d.style) +
    row_('Customer', d.name || '(no name)') +
    row_('Email', '<a href="mailto:' + esc_(d.email) + '">' + esc_(d.email) + '</a>') +
    (d.notes ? row_('Notes', d.notes) : '') +
    '</table>';

  if (d.proofBlob) {
    inline['proof'] = d.proofBlob.copyBlob().setName('proof.png');
    attachments.push(d.proofBlob.copyBlob());
    html += '<h3 style="margin:18px 0 6px">AI proof (draft — refine before sending)</h3>' +
            '<img src="cid:proof" style="max-width:100%;border-radius:8px">';
  } else {
    html += '<p style="margin:16px 0;color:#a40"><b>No AI proof generated</b> — create one by hand.</p>';
  }
  if (d.photoBlob) attachments.push(d.photoBlob.copyBlob());

  html += '<p style="margin:18px 0 4px"><a href="' + sheetLink + '">Open the order book ↗</a></p>' +
          '<p style="color:#999;font-size:12px">Photo of ' + esc_(d.pet) + ' and the proof are attached.</p></div>';

  MailApp.sendEmail({
    to: cfg_('ALERT_EMAIL'),
    subject: subject,
    htmlBody: html,
    inlineImages: inline,
    attachments: attachments
  });
}

function confirmCustomer_(email, name, pet, style) {
  var first = (name || '').split(' ')[0];
  MailApp.sendEmail({
    to: email,
    subject: 'We got your ' + pet + ' portrait request 🎨',
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:15px;max-width:520px">' +
      '<p>Hi' + (first ? ' ' + esc_(first) : '') + ',</p>' +
      '<p>Thanks for choosing ' + esc_(cfg_('BRAND')) + '! Your request for ' +
      esc_(pet) + '\'s <b>' + esc_(style) + '</b> portrait is in. ' +
      'We\'ll email your <b>free proof in 24–48 hours</b> — no payment until you love it.</p>' +
      '<p>— The ' + esc_(cfg_('BRAND')) + ' studio</p></div>'
  });
}

// ============================ Sheet + Drive helpers ============================

function appendRow_(rowValues) {
  getSheet_().appendRow(rowValues);
}

function getSheet_() {
  var id = cfg_('SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create(cfg_('BRAND') + ' — Orders');
    setProp_('SHEET_ID', ss.getId());
  }
  var sh = ss.getSheets()[0];
  sh.setName('Orders');
  if (sh.getLastRow() === 0) {
    sh.appendRow(SHEET_HEADERS);
    sh.getRange(1, 1, 1, SHEET_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function orderFolder_(orderId) {
  var root = rootFolder_();
  var sub = root.createFolder(orderId);
  return sub;
}

function rootFolder_() {
  var id = cfg_('DRIVE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* fall through, recreate */ }
  }
  var f = DriveApp.createFolder(cfg_('BRAND') + ' — Orders');
  setProp_('DRIVE_FOLDER_ID', f.getId());
  return f;
}

// ============================ Small utilities ============================

function dataUrlToBlob_(dataUrl, name) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  var ext = (m[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.' + ext);
}

function makeOrderId_() {
  var stamp = Utilities.formatDate(new Date(), cfg_('TIMEZONE'), 'yyyyMMdd-HHmmss');
  return 'NP-' + stamp + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
}

function now_() { return Utilities.formatDate(new Date(), cfg_('TIMEZONE'), 'yyyy-MM-dd HH:mm:ss'); }
function slug_(s) { return String(s || 'x').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'x'; }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function row_(k, v) { return '<tr><td style="color:#888">' + esc_(k) + '</td><td><b>' + v + '</b></td></tr>'; }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- config (Script Properties with code defaults) ----
function cfg_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === '') ? (DEFAULTS[key] || '') : v;
}
function setProp_(key, val) { PropertiesService.getScriptProperties().setProperty(key, val); }

// ---- one-time helper: run this once from the editor to create Sheet+Folder
//      and grant permissions before going live (optional but recommended). ----
function setup() {
  getSheet_();
  rootFolder_();
  Logger.log('Sheet:  https://docs.google.com/spreadsheets/d/' + cfg_('SHEET_ID'));
  Logger.log('Folder: https://drive.google.com/drive/folders/' + cfg_('DRIVE_FOLDER_ID'));
  Logger.log('Alerts -> ' + cfg_('ALERT_EMAIL'));
  Logger.log('Proofs: ' + (cfg_('GEMINI_API_KEY') ? 'ON' : 'OFF (set GEMINI_API_KEY)'));
}
