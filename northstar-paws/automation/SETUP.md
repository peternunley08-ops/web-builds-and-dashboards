# Northstar Paws — Order Automation (setup)

A self-contained **Google Apps Script** that turns your storefront order form into a
real order pipeline. For every order it: saves the pet photo to Drive → logs the order
to a Google Sheet → **auto-drafts an AI portrait proof (Gemini)** → emails you the order
+ proof. Runs 24/7 on your Google account. No server.

```
storefront form  ──POST──▶  Apps Script web app  ──▶  Drive (photo + proof)
(index.html)                       │                ──▶  Google Sheet (order book)
                                   └────────────────▶  Gmail alert to you (+ AI proof)
```

**Files here**
- `Code.gs` — the whole backend (paste into Apps Script).
- `appsscript.json` — manifest (scopes + web-app settings).
- `test-order.js` — fires a fake order at your deployed URL to verify it works.

---

## Deploy — ~10 minutes (one-time)

### 1. Get a Gemini API key (for the auto-proofs)
1. Go to **https://aistudio.google.com/apikey** (sign in with the Google account you want to own this).
2. **Create API key** → copy it. (Free tier is fine to start.)
   *Skip this and the system still captures + logs + emails — it just won't auto-draw the proof.*

### 2. Create the Apps Script project
1. Go to **https://script.google.com** → **New project**.
2. Delete the starter `function myFunction(){}` and **paste in all of `Code.gs`**.
3. Click the gear ⚙️ (**Project Settings**) → tick **“Show appsscript.json manifest in editor.”**
4. Back in the editor, open `appsscript.json` and replace it with the one in this folder.

### 3. Add your settings (Script Properties)
Project Settings → **Script properties** → **Add script property**, add:

| Property          | Value                                   |
|-------------------|-----------------------------------------|
| `GEMINI_API_KEY`  | *(the key from step 1)*                 |
| `ALERT_EMAIL`     | `orders@example.com`                    |

Optional extras (have sensible defaults — only add to change them):
`GEMINI_MODEL` (default `gemini-2.5-flash-image`), `CONFIRM_CUSTOMER` (`true` to also
auto-email the customer), `PROOFS_ENABLED` (`false` for capture-only), `BRAND`, `TIMEZONE`.

### 4. Authorize + smoke-test
1. In the editor, pick the function **`setup`** in the toolbar dropdown → **Run**.
2. Approve the Google permission prompt (Drive, Sheets, Gmail, external requests).
   *(“Google hasn’t verified this app” → Advanced → Go to project → Allow. It’s your own script.)*
3. Open **Execution log** — it prints your new **Sheet** + **Drive folder** links and whether proofs are ON.

### 5. Deploy as a web app
1. **Deploy ▸ New deployment** → type **Web app**.
2. **Execute as: Me** · **Who has access: Anyone**.  ← both required.
3. **Deploy** → copy the **Web app URL** (ends in `/exec`).

### 6. Wire the storefront to it
1. Open `../index.html`, find line ~479:
   ```js
   const NP_ENDPOINT = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
   Replace the placeholder with your `/exec` URL.
2. **Redeploy the site** so the change goes live. From this project folder:
   ```powershell
   netlify deploy --prod
   ```
   (or drag the project folder onto the Netlify dashboard). Site id is in `.netlify/state.json`.

### 7. Verify end-to-end
From this `automation/` folder:
```powershell
node test-order.js "https://script.google.com/macros/s/XXXX/exec"
```
Expect `{ ok: true, order_id: "NP-..." }`, a new row in the Sheet, files in Drive,
and an email to `ALERT_EMAIL` with the AI proof attached. Then place one real test order
on the live site to confirm the front-end path too.

---

## Day-to-day
- New order → you get an email with the photo + an AI proof draft. The order is row-logged as `PROOF_READY`.
- Refine the proof, email it to the customer, then update the row’s **status / paid / shipped** columns in the Sheet. That Sheet is your single order book.

## Notes & gotchas
- **The one thing I couldn’t test for you:** the live Gemini call (needs your key). If proofs come back empty, the row’s `notes` column says why. Most likely fix: the image model name moved — update the `GEMINI_MODEL` property (check current names at aistudio.google.com).
- **Editing `Code.gs` later?** Apps Script caches deployments — after edits do **Deploy ▸ Manage deployments ▸ Edit ▸ Version: New version** (the `/exec` URL stays the same).
- **Abuse:** the endpoint is public (forms need that). It validates email+pet+photo and the form caps photos at 8 MB. If you ever get spammed, add a shared-secret check — ask me and I’ll wire one in.
- **Costs:** Apps Script, Drive, Sheets, Gmail = free. Gemini image gen uses your API quota (free tier to start; paid beyond it).
