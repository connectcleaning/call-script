/* ------------------------------------------------------------------
 * OPTIONAL example proxy for the Connect Cleaning call script.
 *
 * The call script (app.js) POSTs JSON to the URLs you set in ⚙ Settings.
 * This little server shows how to receive those POSTs and forward them to
 * GoHighLevel, Slack, Asana, Housecall Pro, and a property-data API — with
 * your secrets kept here in environment variables, NOT in the browser.
 *
 * This is a STARTING POINT. You do not need it if you wire the Settings URLs
 * straight into Make / Zapier / n8n instead (see README).
 *
 *   npm install express node-fetch
 *   GHL_TOKEN=... GHL_LOCATION_ID=... SLACK_WEBHOOK=... \
 *   ASANA_TOKEN=... ASANA_PROJECT=... SQFT_API_KEY=... \
 *   node server-example.js
 *
 * Then in the app's Settings, point each field at this server, e.g.
 *   GHL contact webhook       http://localhost:3000/ghl
 *   Square-footage lookup     http://localhost:3000/sqft
 *   HCP estimate webhook      http://localhost:3000/estimate
 *   Booked webhook            http://localhost:3000/booked
 * ------------------------------------------------------------------ */

const express = require('express');
const fetch = require('node-fetch'); // v2
const app = express();
app.use(express.json());

// CORS so the browser page can call this from anywhere it's hosted
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const env = k => process.env[k] || '';

/* 1) GHL — create/update a contact --------------------------------- */
app.post('/ghl', async (req, res) => {
  const c = req.body || {};
  try {
    const r = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env('GHL_TOKEN')}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locationId: env('GHL_LOCATION_ID'),
        firstName: c.firstName, lastName: c.lastName,
        phone: c.phone, email: c.email, address1: c.address,
        source: c.source || 'Inbound call'
      })
    });
    res.status(r.ok ? 200 : 502).json(await r.json().catch(() => ({})));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 2) Square footage from address ----------------------------------- *
 * Swap the URL/parse for whatever property-data API you use
 * (ATTOM, Rentcast, Estated, etc). Return { sqft: <number> }.       */
app.post('/sqft', async (req, res) => {
  const address = (req.body || {}).address;
  try {
    // EXAMPLE shape — replace with your provider:
    const r = await fetch(
      `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`,
      { headers: { 'X-Api-Key': env('SQFT_API_KEY') } }
    );
    const data = await r.json();
    const sqft = Array.isArray(data) ? data[0]?.squareFootage : data?.squareFootage;
    res.json({ sqft: sqft || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 3) "Maybe" → create estimate + email in Housecall Pro ------------ */
app.post('/estimate', async (req, res) => {
  const s = req.body || {};
  // TODO: call the Housecall Pro API to create the estimate and email it.
  console.log('ESTIMATE requested for', s.contact?.email, '·', s.squareFeet, 'sqft');
  res.json({ ok: true });
});

/* 4) "Booked" → Slack Needs-Scheduled + Asana task ----------------- */
app.post('/booked', async (req, res) => {
  const s = req.body || {};
  const name = `${s.contact?.firstName || ''} ${s.contact?.lastName || ''}`.trim();
  try {
    if (env('SLACK_WEBHOOK')) {
      await fetch(env('SLACK_WEBHOOK'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:broom: *Needs Scheduled* — ${name}\n${s.service} · ${s.squareFeet || '?'} sq ft · ${s.contact?.phone}\nReason: ${s.painPhrase || (s.painPoints || []).join(', ') || '—'}`
        })
      });
    }
    if (env('ASANA_TOKEN') && env('ASANA_PROJECT')) {
      await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('ASANA_TOKEN')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            projects: [env('ASANA_PROJECT')],
            name: `Schedule: ${name} (${s.service}, ${s.squareFeet || '?'} sq ft)`,
            notes: `Phone: ${s.contact?.phone}\nEmail: ${s.contact?.email}\nAddress: ${s.contact?.address}\nBucket: ${s.bucket}\nReason: ${s.painPhrase}\n\n${s.closingParagraph}`
          }
        })
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Call-script proxy on http://localhost:${PORT}`));
