// /api/ordertime/items/search.js
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

    const [byName, byNum] = await Promise.all([
      otPost('/list', { Type: 115, NumberOfRecords: 25, PageNumber: 1, Filters: [like('Name')] }),
      otPost('/list', { Type: 115, NumberOfRecords: 25, PageNumber: 1, Filters: [like('Number')] }).catch(() => ([])),
    ]);

    const rows = [
      ...((byName?.result || byName?.Items || byName) || []),
      ...((byNum?.result || byNum?.Items || byNum) || []),
    ];

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(x => ({
        id: x.Id,
        name: x.Name || x.ItemName || x.Number || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || '',
        upc: x.UPC || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || ''
      }));

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Item search failed: ' + e.message });
  }
}
