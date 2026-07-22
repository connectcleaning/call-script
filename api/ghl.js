// Vercel serverless function: GoHighLevel contact upsert (+ opportunity).
//
// Env (Vercel → Settings → Environment Variables):
//   GHL_TOKEN        Private Integration token (contacts.write, opportunities.write)
//   GHL_LOCATION_ID  Sub-account / location id
//
// Behavior:
//   - Always upserts the contact (updates if the phone/email already exists,
//     otherwise creates it).
//   - If body.createOpportunity is true (Booked / "needs scheduled"), it also
//     creates or updates an opportunity in the "Needs Scheduled" stage of the
//     "Residential Sales" pipeline.

const BASE = 'https://services.leadconnectorhq.com';
const H = token => ({
  Authorization: `Bearer ${token}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
  Accept: 'application/json'
});

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.GHL_TOKEN;
  const loc = process.env.GHL_LOCATION_ID;
  if (!token || !loc) {
    return res.status(500).json({ error: 'GHL not configured', detail: 'Set GHL_TOKEN and GHL_LOCATION_ID in Vercel.' });
  }

  const c = req.body || {};
  try {
    // 1) Upsert the contact (dedupes on phone/email within the location)
    const up = await fetch(`${BASE}/contacts/upsert`, {
      method: 'POST',
      headers: H(token),
      body: JSON.stringify({
        locationId: loc,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        email: c.email || undefined,
        phone: c.phone || undefined,
        address1: c.address || undefined,
        source: c.source || 'Inbound call — CSR script'
      })
    });
    const upData = await up.json().catch(() => ({}));
    if (!up.ok) return res.status(up.status).json({ error: 'GHL contact upsert failed', detail: upData });

    const contact = upData.contact || upData;
    const contactId = contact && contact.id;
    const out = { ok: true, contactId, contactAction: upData.new === false ? 'updated' : 'upserted' };

    // 2) Opportunity for Booked / needs-scheduled
    if (c.createOpportunity && contactId) {
      out.opportunity = await upsertOpportunity(token, loc, contactId, c);
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: 'Request failed', detail: String(e) });
  }
}

async function upsertOpportunity(token, loc, contactId, c) {
  // Find the "Residential Sales" pipeline and its "Needs Scheduled" stage
  const pRes = await fetch(`${BASE}/opportunities/pipelines?locationId=${loc}`, { headers: H(token) });
  const pData = await pRes.json().catch(() => ({}));
  if (!pRes.ok) return { ok: false, error: 'pipelines fetch failed', detail: pData };

  const pipelines = pData.pipelines || [];
  const pipeline = pipelines.find(p => /residential\s*sales/i.test(p.name || '')) || pipelines[0];
  if (!pipeline) return { ok: false, error: 'no pipeline found' };
  const stages = pipeline.stages || [];
  const stage = stages.find(s => /needs\s*scheduled/i.test(s.name || '')) || stages[0];
  if (!stage) return { ok: false, error: 'no stage found', pipeline: pipeline.name };

  const name = (c.opportunity && c.opportunity.name) ||
               `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'New booking';
  const monetaryValue = c.opportunity && c.opportunity.monetaryValue;

  // Update if this contact already has an opportunity, else create
  let existing = null;
  try {
    const sRes = await fetch(`${BASE}/opportunities/search?location_id=${loc}&contact_id=${contactId}`, { headers: H(token) });
    const sData = await sRes.json().catch(() => ({}));
    existing = (sData.opportunities || [])[0] || null;
  } catch (_) {}

  if (existing) {
    const uRes = await fetch(`${BASE}/opportunities/${existing.id}`, {
      method: 'PUT',
      headers: H(token),
      body: JSON.stringify({
        pipelineId: pipeline.id,
        pipelineStageId: stage.id,
        name,
        status: 'open',
        ...(monetaryValue ? { monetaryValue } : {})
      })
    });
    const uData = await uRes.json().catch(() => ({}));
    return { ok: uRes.ok, action: 'updated', id: existing.id, pipeline: pipeline.name, stage: stage.name, ...(uRes.ok ? {} : { detail: uData }) };
  }

  const cRes = await fetch(`${BASE}/opportunities/`, {
    method: 'POST',
    headers: H(token),
    body: JSON.stringify({
      locationId: loc,
      pipelineId: pipeline.id,
      pipelineStageId: stage.id,
      contactId,
      name,
      status: 'open',
      ...(monetaryValue ? { monetaryValue } : {})
    })
  });
  const cData = await cRes.json().catch(() => ({}));
  return { ok: cRes.ok, action: 'created', id: cData.opportunity && cData.opportunity.id, pipeline: pipeline.name, stage: stage.name, ...(cRes.ok ? {} : { detail: cData }) };
}
