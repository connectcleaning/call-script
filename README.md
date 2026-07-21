# Connect Cleaning — Live Call Script

An interactive, in-browser version of the CSR sales script. The rep reads it top to
bottom while it reacts in real time: she enters the customer's info and square
footage, picks pain points, and the pricing + closing paragraph update instantly.
At the end she logs the outcome, which fires the right downstream automation.

**No build step, no server required to run it.** It's plain HTML/CSS/JS — open
`index.html` or host the folder on any static host. Integrations are optional and
added later by pasting webhook URLs into the ⚙ Settings panel.

---

## What it does

| Feature | Where | How it works |
|---|---|---|
| **Capture F/L name, phone, email, address** | Top contact bar | Fields stay sticky the whole call. **Save to GHL** pushes the contact to GoHighLevel. |
| **Address → square footage** | ⌂ button next to Address (and in the rail) | POSTs the address to your lookup endpoint and fills in sq ft to confirm with the customer. No endpoint set? It opens a property search so you can read + type the number. |
| **Sq ft → live pricing from the range buckets** | Right rail | Reads the 36 sq-ft buckets straight from the pricebook (0–11,500 sq ft). Biweekly is flagged as the recommendation; the numbers also flow into the read-aloud script lines. Window Cleaning uses the Gold/Silver/Bronze per-sq-ft rates with the $197 minimum. |
| **Pain-point → rephrased closing paragraph** | Step 4, right rail | Pick chips *or* type a phrase like "upcoming knee surgery." The closing paragraph rewrites **instantly** (local, no API round-trip). Optional **✨ AI polish** hits an LLM endpoint if you want a fully generated rewrite. |
| **Outcomes** | Bottom bar | **Declined** · **Maybe → send estimate (HCP email)** · **Booked → Needs-Scheduled cadence (Slack/Asana)**. Each POSTs the full call summary to the matching webhook. |

Every service section from the original script is included (House Cleaning,
Window Cleaning, Airbnb/Turnover, Pressure Washing, Commercial/HOA) with the
read-aloud lines, coaching notes, and branch scenarios intact.

---

## Running it

**Fastest:** double-click `index.html` — it runs in the browser as-is.

**Recommended (so the ⌂ / GHL / outcome calls aren't blocked by browser file-URL rules):**
serve the folder statically.

```bash
# any of these from inside the folder:
python3 -m http.server 8080      # → http://localhost:8080
npx serve .
```

**Deploy for the whole team** (free, gives a shareable URL): drop the folder on
Netlify, Vercel, Cloudflare Pages, or GitHub Pages. It's all static files.

---

## Connecting your tools (⚙ Settings)

Open the ⚙ button (top-right) and paste a URL for each action you want live.
Blank fields fall back to a manual step, so the tool is useful immediately and
gets more automated as you wire things up. Settings are stored in the browser.

| Setting | Fires when | Payload sent (POST JSON) | Expected back |
|---|---|---|---|
| **GHL contact webhook** | "Save to GHL" | `{firstName,lastName,phone,email,address,source}` | (ignored) |
| **Square-footage lookup URL** | ⌂ sq ft | `{address}` | `{sqft: 2100}` (also accepts `squareFeet` / `livingArea`) |
| **HCP estimate webhook** | "Maybe" outcome | full call summary (below) | (ignored) |
| **Booked / Needs-Scheduled webhook** | "Booked" outcome | full call summary | (ignored) |
| **AI rewrite endpoint** | ✨ AI polish | `{draft,painPoints,freeText,favoriteRoom,firstName,instruction}` | `{text: "…"}` |

**Call summary** (sent on outcomes):
```json
{
  "outcome": "booked",
  "timestamp": "2026-07-21T15:04:00.000Z",
  "service": "house",
  "contact": { "firstName": "...", "lastName": "...", "phone": "...", "email": "...", "address": "..." },
  "squareFeet": 2100,
  "bucket": "1901-2200",
  "painPoints": ["Surgery / injury recovery"],
  "painPhrase": "upcoming knee surgery",
  "favoriteRoom": "the kitchen",
  "closingParagraph": "Sarah, I know you've been recovering...",
  "addons": ["fridge"],
  "windowPackage": null
}
```

### The easy way to wire these: one automation platform

Point each URL at a webhook trigger in **Make, Zapier, or n8n** and build the
downstream step there — no code, and your API keys stay off the CSR's browser:

- **GHL contact** → GoHighLevel "Create/Update Contact" module.
- **Sq ft lookup** → a property-data API (e.g. ATTOM, Rentcast, Estated, or a
  Zillow/Redfin scraper you already use). Return `{ "sqft": <number> }`.
  *(There is no free public Zillow API — this is why it's an endpoint you supply.)*
- **HCP estimate** → Housecall Pro "create estimate" + send email.
- **Booked** → Slack message to your Needs-Scheduled channel **and** an Asana task
  in your scheduling project.

### Or run the tiny included proxy

`server-example.js` is a ~60-line Node/Express example showing how to receive
these POSTs and forward them to GHL / Slack / Asana with your keys in env vars.
It's a starting point, not required.

```bash
npm init -y && npm install express node-fetch
GHL_TOKEN=... SLACK_WEBHOOK=... node server-example.js
# then in Settings use http://localhost:3000/ghl, /booked, etc.
```

---

## Updating prices

Pricing lives in `data.js` (`HOME_BUCKETS`, `WINDOW`, `ADDONS`) — generated from
`ConnectCleaning_pricebook_export.csv`. When the pricebook changes, re-export and
regenerate that array. Nothing else needs to change.

## Files

```
index.html   the script UI (all five services)
styles.css   styling
data.js      pricing buckets + pain-point/rephrase content  ← edit to update prices
app.js       logic: pricing engine, rephraser, integrations
server-example.js   optional example proxy for GHL/Slack/Asana/HCP
```
