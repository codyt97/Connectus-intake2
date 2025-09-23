// /api/ordertime/items/search.js
import { otPost } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const like = (prop) => ({
      PropertyName: prop,
      FieldType: 1,
      Operator: 12,             // contains
      FilterValueArray: [q]
    });

    const [byName, byNum, byMfg, byUpc] = await Promise.all([
  otPost('/PartItem/Search', { Page: 1, Take: 50, FilterParams: [like('Name')] }),
  otPost('/PartItem/Search', { Page: 1, Take: 50, FilterParams: [like('Number')] }),
  otPost('/PartItem/Search', { Page: 1, Take: 50, FilterParams: [like('ManufacturerPartNo')] }),
  otPost('/PartItem/Search', { Page: 1, Take: 50, FilterParams: [like('UPC')] }),
]);


    const seen = new Set();
    const out = [...byName, ...byNum, ...byMfg, ...byUpc]
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
    console.error('items/search', e);
    res.status(500).json({ error: 'Item search failed: ' + e.message });
  }
}
