import { listCustomersByName } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { q = '', page = '1', take = '25' } = req.query;
    if (!q.trim()) return res.status(400).json({ error: 'Missing query ?q=' });

    const rows = await listCustomersByName(q.trim(), Number(page)||1, Number(take)||25);

    const items = rows.map(r => ({
      id: r.Id ?? r.ID ?? r.id,
      company: r.Name || r.CompanyName || r.Company || '',
      city: r.City || r.BillingCity || '',
      state: r.State || r.BillingState || '',
      zip: r.Zip || r.BillingZip || '',
      billingContact: r.BillingContact || '',
      billingPhone:   r.BillingPhone || '',
      billingEmail:   r.BillingEmail || ''
    }));

    res.status(200).json(items);
  } catch (err) {
    console.error('customers/search error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
}
