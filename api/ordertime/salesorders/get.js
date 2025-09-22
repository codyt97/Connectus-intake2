export default async function handler(req, res) {
  const BASE = process.env.OT_BASE_URL;
  const KEY  = process.env.OT_API_KEY;

  try {
    const docNo = parseInt(req.query.docNo, 10);
    if (!docNo) return res.status(400).json({ error: 'docNo is required' });

    const r = await fetch(`${BASE}/salesorder?docNo=${docNo}`, {
      headers: { ApiKey: KEY }
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fetch sales order failed' });
  }
}
