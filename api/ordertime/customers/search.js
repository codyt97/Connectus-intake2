import { otList, like } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // Correct keys + correct field names
    const listBody = {
      Type: 'Customer',
      Page: 1,
      Take: 50,
      SortParams: [{ PropertyName: 'Name', SortDirection: 0 }], // 0 = Asc
      FilterParams: [
        like('Name', q),
        like('CompanyName', q),
        like('Email', q),
        like('Phone', q),
      ],
    };
 
    const data = await otList(listBody);
    const rows = Array.isArray(data?.Records) ? data.Records : (Array.isArray(data) ? data : []);

    const out = rows.map(x => ({
      id: x.Id,
      company: x.CompanyName || x.Name || '',
      email: x.Email || x.BillingEmail || '',
      phone: x.Phone || x.BillingPhone || '',
      city: x.BillingCity || x.City || '',
      state: x.BillingState || x.State || '',
    }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/customers/search failed: ${err.message || err}` });
  }
}
