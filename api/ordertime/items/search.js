// /api/ordertime/items/search.js
import { otList } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const base = {
      Type: 'PartItem',
      PageNumber: 1,
      NumberOfRecords: 50,
      Sortation: { PropertyName: 'Name', Direction: 'Asc' },
    };

    // Two passes (name/number) – keeps filter logic simple and avoids AND/OR gymnastics
    const [byName, byNumber, byMfg] = await Promise.all([
      otList({ ...base, Filters: [{ PropertyName: 'Name', FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] }] }),
      otList({ ...base, Filters: [{ PropertyName: 'Number', FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] }] }),
      otList({ ...base, Filters: [{ PropertyName: 'ManufacturerPartNo', FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] }] }),
    ]);

    const rows = [...(byName?.Records || byName || []), ...(byNumber?.Records || byNumber || []), ...(byMfg?.Records || byMfg || [])];
    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(x => ({
        id: x.Id,
        name: x.Name || x.ItemName || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || '',
        upc: x.UPC || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${String(err.message || err)}` });
  }
}
