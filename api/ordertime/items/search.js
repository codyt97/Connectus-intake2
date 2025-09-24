// /api/ordertime/items/search.js
const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const columns = [
      'Name','ItemName','Number','ItemNumber','SKU',
      'ManufacturerPartNo','ManufacturerPartNumber','MfgPartNo',
      'UPC','UPCCode','Description'
    ];

    const rows = await listSearch({ type: 'PartItem', q, columns, sortProp: 'Id', dir: 'Asc' });

    const pick = (o, keys) => { for (const k of keys) if (o && o[k]) return o[k]; return ''; };
    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(x => ({
        id: x.Id,
        name: pick(x, ['Name','ItemName','Description','Number','ItemNumber','SKU']) || '',
        description: pick(x, ['Description']) || '',
        mfgPart: pick(x, ['ManufacturerPartNo','ManufacturerPartNumber','MfgPartNo']) || '',
        upc: pick(x, ['UPC','UPCCode']) || '',
        price: (x.SalesPrice ?? x.Price ?? x.UnitPrice ?? 0) || 0,
        sku: pick(x, ['Number','ItemNumber','SKU']) || ''
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
};
