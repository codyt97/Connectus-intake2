// /api/ordertime/customers/search.js
import { otPost } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q0 = String(req.query.q || '').trim();
    if (!q0) return res.status(200).json([]);

    const q = q0.replace(/\s+/g, ' ').trim();

    const like = (prop) => ({
      PropertyName: prop,
      FieldType: 1,      // string
      Operator: 12,      // contains
      FilterValueArray: [q]
    });

    const calls = [
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('Name')] }),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('CompanyName')] }),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('ShipToCompany')] }).catch(() => []),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('ShipToCity')] }).catch(() => []),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('ShipToState')] }).catch(() => []),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('ShipToZip')] }).catch(() => []),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('BillingCity')] }).catch(() => []),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('BillingState')] }).catch(() => []),
      otPost('/list', { Type: 120, NumberOfRecords: 25, PageNumber: 1, Filters: [like('BillingZip')] }).catch(() => []),
    ];

    const results = await Promise.all(calls);
    const rows = [].concat(...results.map(r => (r?.result || r?.Items || r || [])));

    const seen = new Set();
    const out = rows
      .filter(r => (r?.Id != null) && (seen.has(r.Id) ? false : seen.add(r.Id)))
      .map(r => ({
        id: r.Id ?? r.id,
        company: r.Name || r.CompanyName || r.ShipToCompany || r.Company || '',
        city: r.City || r.ShipToCity || r.BillingCity || '',
        state: r.State || r.ShipToState || r.BillingState || '',
        zip: r.Zip || r.ShipToZip || r.BillingZip || '',
      }));

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Customer search failed: ' + e.message });
  }
}
