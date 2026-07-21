// Vercel serverless function: create/update a GoHighLevel contact.
// Secrets live in Vercel → Project → Settings → Environment Variables:
//   GHL_TOKEN        (Private Integration token with contacts.write)
//   GHL_LOCATION_ID  (the sub-account / location id)
//
// The call-script UI POSTs { firstName, lastName, phone, email, address, source }.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    return res.status(500).json({
      error: 'GHL not configured',
      detail: 'Set GHL_TOKEN and GHL_LOCATION_ID in Vercel Environment Variables.'
    });
  }

  const c = req.body || {};
  try {
    const r = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locationId,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        phone: c.phone || undefined,
        email: c.email || undefined,
        address1: c.address || undefined,
        source: c.source || 'Inbound call — CSR script'
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      // GHL returns 400 "duplicated contacts" when the contact already exists —
      // surface it clearly; the contact is already in GHL in that case.
      return res.status(r.status).json({ error: 'GHL error', status: r.status, detail: data });
    }
    return res.status(200).json({ ok: true, contact: data.contact || data });
  } catch (e) {
    return res.status(502).json({ error: 'Request failed', detail: String(e) });
  }
}
