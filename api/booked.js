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
  const appt = s.appointment || {};
  const apptLabel = appt.dayLabel
    ? `${appt.dayLabel}${appt.arrivalWindow ? ', ' + appt.arrivalWindow + ' arrival' : ''}`
    : 'not set';
  const results = {};

  try {
    if (process.env.SLACK_WEBHOOK) {
      const r = await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:broom: *Needs Scheduled* — ${name}\n` +
                `${s.service || 'service'} · ${s.squareFeet || '?'} sq ft · ${s.contact?.phone || 'no phone'}\n` +
                `Requested: ${apptLabel}\n` +
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
                   `Requested: ${apptLabel}\nReason: ${reason}\n\n${s.closingParagraph || ''}`
          }
        })
      });
      results.asana = r.ok ? 'created' : `error ${r.status}`;
    } else results.asana = 'skipped (no ASANA_TOKEN/ASANA_PROJECT)';

    // Optional: create the actual job in Housecall Pro.
    // HCP's booking/job creation needs more than a token — you must map the
    // service to an HCP job type and the arrival window to HCP's scheduling
    // fields. Fill in HCP_TOKEN + the job-type id below to turn this on.
    if (process.env.HCP_TOKEN && process.env.HCP_JOB_TYPE_ID) {
      results.hcp = await bookHcpJob(s, appt).catch(e => 'error: ' + String(e));
    } else {
      results.hcp = 'skipped (set HCP_TOKEN + HCP_JOB_TYPE_ID to auto-create the job)';
    }

    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(502).json({ error: 'Request failed', detail: String(e), results });
  }
}

/* ---- Housecall Pro job creation (scaffold) ---------------------------------
 * Maps the arrival windows (8–10, 10–12, 12–2, 2–4) to start/end times on the
 * chosen day and creates a scheduled job. Verify field names against your HCP
 * API access — HCP's write/booking endpoints vary by plan and require the
 * customer + address to exist first. This is a starting point, not turnkey. */
const HCP_WINDOWS = {
  '8–10':  ['08:00', '10:00'], '10–12': ['10:00', '12:00'],
  '12–2':  ['12:00', '14:00'], '2–4':   ['14:00', '16:00']
};
async function bookHcpJob(summary, appt) {
  if (!appt.date || !appt.arrivalWindow) return 'skipped (no day/arrival window chosen)';
  const win = HCP_WINDOWS[appt.arrivalWindow];
  if (!win) return 'skipped (unknown arrival window)';
  const start = `${appt.date}T${win[0]}:00`;
  const end   = `${appt.date}T${win[1]}:00`;

  const r = await fetch('https://api.housecallpro.com/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HCP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // TODO: create/lookup the customer first and pass customer_id + address_id.
      job_type_id: process.env.HCP_JOB_TYPE_ID,
      schedule: { scheduled_start: start, scheduled_end: end, arrival_window_minutes: 120 },
      note: summary.closingParagraph || '',
      work_status: 'scheduled'
    })
  });
  return r.ok ? 'job created' : `error ${r.status}`;
}
