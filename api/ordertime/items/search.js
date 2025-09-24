// /api/ordertime/items/search.js 
const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // allow client to request more; cap for safety
    const limit = Math.min(parseInt(req.query.limit || '120', 10) || 120, 300);

    const rows = await listSearch({
      type: 'PartItem',
      q,
      columns: ['Name','Number','ManufacturerPartNo','UPC','Description'],
      sortProp: 'Name',
      dir: 'Asc',
      pageSize: 200,   // bigger pages
      maxPages: 25,    // scan deeper
      scanLimit: limit // stop when enough found
    });

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(x => ({
        id: x.Id,
        name: x.Name || x.ItemName || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || '',
        upc: x.UPC || x.UPCCode || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || '',
      }));

    res.status(200).json(out.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
};
