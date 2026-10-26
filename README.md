# ⚡ Web Builds, Serverless Automations & Dashboards

A curated monorepo of standalone web applications, community event platforms, serverless e-commerce pipelines, and privacy-first personal dashboards built by **Peter Nunley**.

Every project in this repository is designed with **zero heavy frontend build requirements** — open any `index.html` directly in a browser or serve it statically via GitHub Pages / Netlify.

---

## 📂 Projects Included

| Project | Folder | Stack | Highlights |
|---|---|---|---|
| **🍩 Donut Dash** | [`./donut-dash`](./donut-dash) | HTML5, CSS Tokens, Vanilla JS, Leaflet.js, Formspree | Community 5K run & fundraiser site benefiting the **SLO Food Bank** (San Luis Obispo, CA) with an interactive Leaflet route map, dynamic age-based fee calculator, and dark/light theme toggle. |
| **🐾 Northstar Paws** | [`./northstar-paws`](./northstar-paws) | HTML5/JS Storefront, Google Apps Script, Gemini Vision API | Custom pet-portrait storefront paired with a serverless **Google Apps Script** backend (`automation/Code.gs`) that saves pet photos to Drive, logs orders to Sheets, and generates an AI portrait proof via Gemini. |
| **💳 Money Dashboard** | [`./money-dashboard`](./money-dashboard) | Vanilla JS, SVG Charts, CSV Parser, `localStorage` | 100% client-side Chase & PayPal CSV budget analyzer. Features automatic keyword categorization, editable monthly category budgets, interactive SVG donut charts, duplicate detection, and 1-click synthetic demo data. |
| **🎛️ Command Center UI** | [`./command-center-ui`](./command-center-ui) | HTML5, CSS Grid, Dark-Mode Design System | High-contrast personal operations dashboard for monitoring multi-project launch readiness gates, daily focus tasks, and portfolio metrics. |

---

## 🖥️ Quick Local Preview

Because each project is self-contained, you can preview the entire collection with Python's built-in HTTP server:

```bash
python3 -m http.server 8080
```

Then visit:
- **Donut Dash:** `http://localhost:8080/donut-dash/`
- **Northstar Paws:** `http://localhost:8080/northstar-paws/`
- **Money Dashboard:** `http://localhost:8080/money-dashboard/` (click **"Load sample data"** to test with synthetic transactions)
- **Command Center UI:** `http://localhost:8080/command-center-ui/`
