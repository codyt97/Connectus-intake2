// /api/ordertime/items/search.js
import { otPost } from '../../_ot';   // <- ensure single ../../ (no double slash)

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

    // Different tenants expose items under different Types; sweep a few common ones:
    const types = [115, 114, 116, 118]; // 115=Item, 114=Assembly/Kit, 116=Non-Inv, 118=Service (varies by tenant)
    const calls = [];

    for (const t of types) {
      calls.push(otPost('/list', { Type: t, NumberOfRecords: 50, PageNumber: 1, Filters: [like('Number')] }).catch(()=>[]));
      calls.push(otPost('/list', { Type: t, NumberOfRecords: 50, PageNumber: 1, Filters: [like('Name')] }).catch(()=>[]));
      calls.push(otPost('/list', { Type: t, NumberOfRecords: 50, PageNumber: 1, Filters: [like('Description')] }).catch(()=>[]));
      calls.push(otPost('/list', { Type: t, NumberOfRecords: 50, PageNumber: 1, Filters: [like('ManufacturerPartNo')] }).catch(()=>[]));
      calls.push(otPost('/list', { Type: t, NumberOfRecords: 50, PageNumber: 1, Filters: [like('UPC')] }).catch(()=>[]));
    }

    const results = await Promise.all(calls);
    const rows = [].concat(...results.map(r => (r?.result || r?.Items || r || [])));

    // crude relevance
    const norm = q.toLowerCase();
    const score = (x) => {
      const fields = [x.Number, x.Name, x.Description, x.ManufacturerPartNo, x.UPC]
        .map(v => String(v || '').toLowerCase());
      let s = 0;
      if (fields[0].includes(norm)) s += 5;
      if (fields[1].includes(norm)) s += 4;
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
        sku: x.Number || ''    // critical for “OrderTime SKU”
      }));

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'Item search failed: ' + e.message });
  }
}
