import { listCustomersByName } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { q = '', page = '1', take = '25' } = req.query;
    if (!q.trim()) {
      return res.status(400).json({ error: 'Missing query ?q=' });
    }

    const rows = await listCustomersByName(q.trim(), Number(page) || 1, Number(take) || 25);

    const mapId = (r) =>
      r?.Id ??
      r?.ID ??
      r?.id ??
      r?.CustomerId ??
      r?.CustomerID ??
      r?.CustomerIdRef ??
      r?.CustomerRef?.Id ??
      r?.CustomerRef?.ID ??
      r?.CustomerRef?.id ??
      null;

    const items = (Array.isArray(rows) ? rows : []).map(r => ({
      id: mapId(r),
      company: r.Name || r.CompanyName || r.Company || '',
      city:    r.City || r.BillingCity || '',
      state:   r.State || r.BillingState || '',
      zip:     r.Zip || r.BillingZip || '',
      billingContact: r.BillingContact || '',
      billingPhone:   r.BillingPhone   || '',
      billingEmail:   r.BillingEmail   || '',
    })).filter(x => x.id !== null); // only keep results we can hydrate

    return res.status(200).json(items);
  } catch (err) {
    console.error('customers/search error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
