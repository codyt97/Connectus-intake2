// /api/ordertime/items/search.js
import { otPost } from '../..//_ot';

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
      otPost('/list', { Type: 115, NumberOfRecords: 50, PageNumber: 1, Filters: [like('Number')] }),
      otPost('/list', { Type: 115, NumberOfRecords: 50, PageNumber: 1, Filters: [like('Name')] }).catch(() => []),
      otPost('/list', { Type: 115, NumberOfRecords: 50, PageNumber: 1, Filters: [like('Description')] }).catch(() => []),
      otPost('/list', { Type: 115, NumberOfRecords: 50, PageNumber: 1, Filters: [like('ManufacturerPartNo')] }).catch(() => []),
      otPost('/list', { Type: 115, NumberOfRecords: 50, PageNumber: 1, Filters: [like('UPC')] }).catch(() => []),
    ];

    const results = await Promise.all(calls);
    const rows = [].concat(...results.map(r => (r?.result || r?.Items || r || [])));

    const norm = q.toLowerCase();
    const score = (x) => {
      const fields = [
        x.Number, x.Name, x.Description, x.ManufacturerPartNo, x.UPC
      ].map(v => String(v || '').toLowerCase());
      let s = 0;
      if (fields[0].includes(norm)) s += 5;  // Number hit
      if (fields[1].includes(norm)) s += 4;  // Name hit
      if (fields.some(f => f.includes(norm))) s += 1;
      return s;
    };

    const seen = new Set();
    const out = rows
      .filter(r => (r?.Id != null) && (seen.has(r.Id) ? false : seen.add(r.Id)))
      .sort((a,b) => score(b) - score(a))
      .map(x => ({
        id: x.Id,
        name: x.Name || x.ItemName || x.Number || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || '',
        upc: x.UPC || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || ''    // <- critical for applying to the line
      }));

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Item search failed: ' + e.message });
  }
}
