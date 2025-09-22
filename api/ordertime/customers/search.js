// /api/ordertime/customers/search.js
import { otPost } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const like = (prop) => ({
      PropertyName: prop,
      FieldType: 1,                 // String
      Operator: 12,                 // LIKE/contains
      FilterValueArray: [q]
    });

    const [byName, byCompany] = await Promise.all([
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('Name')] }),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('CompanyName')] }).catch(() => ([])),
    ]);

    const rows = [
      ...((byName?.result || byName?.Items || byName) || []),
      ...((byCompany?.result || byCompany?.Items || byCompany) || []),
    ];

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id ?? r.id,
        company: r.Name || r.CompanyName || r.Company || '',
        city: r.City || r.BillingCity || '',
        state: r.State || r.BillingState || '',
        zip: r.Zip || r.BillingZip || '',
      }));

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Customer search failed: ' + e.message });
  }
}
