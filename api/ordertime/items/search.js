import { otList, like } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const base = { Type: 'PartItem', Page: 1, Take: 50, SortParams: [{ PropertyName: 'Name', SortDirection: 0 }] };

    const [byName, byNumber, byMfg] = await Promise.all([
      otList({ ...base, FilterParams: [like('Name', q)] }),
      otList({ ...base, FilterParams: [like('Number', q)] }),
      otList({ ...base, FilterParams: [like('ManufacturerPartNo', q)] }),
    ]);

    const rows = [
      ...(Array.isArray(byName?.Records) ? byName.Records : Array.isArray(byName) ? byName : []),
      ...(Array.isArray(byNumber?.Records) ? byNumber.Records : Array.isArray(byNumber) ? byNumber : []),
      ...(Array.isArray(byMfg?.Records) ? byMfg.Records : Array.isArray(byMfg) ? byMfg : []),
    ];

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
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
}
