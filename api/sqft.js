// Vercel serverless function: address → square footage.
// There is no free public Zillow API, so plug in whatever property-data
// provider you use (Rentcast, ATTOM, Estated, …) and return { sqft }.
//
// Env var: SQFT_API_KEY  (this example is shaped for Rentcast — swap as needed)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const address = (req.body || {}).address;
  if (!address) return res.status(400).json({ error: 'address required' });

  const key = process.env.SQFT_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'sqft lookup not configured',
      detail: 'Set SQFT_API_KEY and point this at your property-data provider.'
    });
  }

  try {
    // EXAMPLE (Rentcast) — replace URL/parsing for your provider:
    const r = await fetch(
      `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`,
      { headers: { 'X-Api-Key': key } }
    );
    const data = await r.json().catch(() => null);
    const sqft = Array.isArray(data) ? data[0]?.squareFootage : data?.squareFootage;
    return res.status(200).json({ sqft: sqft || null });
  } catch (e) {
    return res.status(502).json({ error: 'Lookup failed', detail: String(e) });
  }
}
