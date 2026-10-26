# 🐾 Northstar Paws — Storefront & Gemini AI Proof Pipeline

A custom pet-portrait e-commerce storefront (`index.html`) paired with a serverless **Google Apps Script + Gemini Vision** order fulfillment backend (`automation/`).

## Architecture
```text
Storefront Form (index.html)
   └── POST ──▶ Google Apps Script Web App (automation/Code.gs)
                   ├── Saves customer pet photo & AI proof to Google Drive
                   ├── Logs order row & status to Google Sheets
                   └── Calls Gemini Vision API to draft an artistic proof & emails alert
```

See [`automation/SETUP.md`](./automation/SETUP.md) for deployment instructions and [`automation/test-order.js`](./automation/test-order.js) for end-to-end smoke testing.
