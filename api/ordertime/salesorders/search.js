// /api/ordertime/salesorders/search.js
import { otPost } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const like = (prop) => ({
      PropertyName: prop,
      FieldType: 1,
      Operator: 12,
      FilterValueArray: [q]
    });

    const [byDoc, byCust] = await Promise.all([
      otPost('/list', { Type: 7, NumberOfRecords: 25, PageNumber: 1, Filters: [like('DocNumber')] }),
      otPost('/list', { Type: 7, NumberOfRecords: 25, PageNumber: 1, Filters: [like('CustomerRef.Name')] }).catch(() => ([])),
    ]);

    const rows = [
      ...((byDoc?.result || byDoc?.Items || byDoc) || []),
      ...((byCust?.result || byCust?.Items || byCust) || []),
    ];

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.Number || r.DocNo || '',
        customer: r.CustomerRef?.Name || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || ''
      }));

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'SO search failed: ' + e.message });
  }
}
