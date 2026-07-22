// Vercel serverless function: fetch open slots for ONE technician's schedule
// (used for window-cleaning scheduling). SCAFFOLD — wire to the Housecall Pro
// API once you have access and know which employee to read.
//
// Env vars (Vercel → Settings → Environment Variables):
//   HCP_TOKEN            Housecall Pro API token
//   HCP_WINDOW_TECH_ID   The employee/technician id whose calendar to read
//
// Request:  GET /api/hcp-availability?from=2026-08-01&to=2026-08-07
// Response: { slots: [{ date, window }] }  using our arrival windows

export default async function handler(req, res) {
  const token = process.env.HCP_TOKEN;
  const techId = process.env.HCP_WINDOW_TECH_ID;
  if (!token || !techId) {
    return res.status(200).json({
      configured: false,
      detail: 'Set HCP_TOKEN and HCP_WINDOW_TECH_ID to pull live availability.'
    });
  }

  const from = req.query.from;
  const to   = req.query.to;
  try {
    // NOTE: verify the exact endpoint + shape against your HCP API access.
    // This reads the tech's scheduled jobs and returns the open arrival windows.
    const r = await fetch(
      `https://api.housecallpro.com/employees/${techId}/schedule?start=${from}&end=${to}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: 'HCP error', detail: data });

    // TODO: transform HCP's busy blocks into free arrival windows
    // (8–10, 10–12, 12–2, 2–4) for each day in range.
    return res.status(200).json({ configured: true, raw: data, slots: [] });
  } catch (e) {
    return res.status(502).json({ error: 'Request failed', detail: String(e) });
  }
}
