// Vercel serverless function: "Booked" outcome → Needs-Scheduled cadence.
// Posts to Slack and/or creates an Asana task. Both are optional — if the
// matching env vars are absent, that channel is skipped (no error).
//
// Env vars (Vercel → Settings → Environment Variables):
//   SLACK_WEBHOOK   Incoming-webhook URL for your Needs-Scheduled channel
//   ASANA_TOKEN     Asana personal access token
//   ASANA_PROJECT   Asana project gid for the scheduling board

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const s = req.body || {};
  // Only the "booked" outcome should ever trigger the Needs-Scheduled cadence.
  if (s.outcome && s.outcome !== 'booked') {
    return res.status(200).json({ ok: true, results: { skipped: `outcome=${s.outcome}` } });
  }
  const name = `${s.contact?.firstName || ''} ${s.contact?.lastName || ''}`.trim() || 'New customer';
  const reason = s.painPhrase || (s.painPoints || []).join(', ') || '—';
  const results = {};

  try {
    if (process.env.SLACK_WEBHOOK) {
      const r = await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:broom: *Needs Scheduled* — ${name}\n` +
                `${s.service || 'service'} · ${s.squareFeet || '?'} sq ft · ${s.contact?.phone || 'no phone'}\n` +
                `Reason: ${reason}`
        })
      });
      results.slack = r.ok ? 'sent' : `error ${r.status}`;
    } else results.slack = 'skipped (no SLACK_WEBHOOK)';

    if (process.env.ASANA_TOKEN && process.env.ASANA_PROJECT) {
      const r = await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.ASANA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            projects: [process.env.ASANA_PROJECT],
            name: `Schedule: ${name} (${s.service}, ${s.squareFeet || '?'} sq ft)`,
            notes: `Phone: ${s.contact?.phone}\nEmail: ${s.contact?.email}\n` +
                   `Address: ${s.contact?.address}\nBucket: ${s.bucket}\n` +
                   `Reason: ${reason}\n\n${s.closingParagraph || ''}`
          }
        })
      });
      results.asana = r.ok ? 'created' : `error ${r.status}`;
    } else results.asana = 'skipped (no ASANA_TOKEN/ASANA_PROJECT)';

    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(502).json({ error: 'Request failed', detail: String(e), results });
  }
}
