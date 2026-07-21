// Vercel serverless function: "Maybe" outcome → send estimate via email in HCP.
// Placeholder: wire this to the Housecall Pro API (create estimate + email).
// For now it accepts the call summary and returns ok so the UI confirms the
// hand-off; add your HCP call where marked.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const s = req.body || {};

  // TODO: call the Housecall Pro API here to create the estimate and email it,
  // using process.env.HCP_TOKEN. Example endpoints live in HCP's API docs.
  console.log('[estimate] requested for', s.contact?.email, '·', s.squareFeet, 'sq ft');

  return res.status(200).json({ ok: true, note: 'Received. Wire HCP API in api/estimate.js to auto-send.' });
}
