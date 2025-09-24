const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const rows = await listSearch({
      type: 'PartItem',
      q,
      columns: ['Name','ItemName','Number','ManufacturerPartNo','MfgPartNo','UPC','UPCCode','Description'],
      sortProp: 'Name',
      dir: 'Asc',
      pageSize: 200,   // was 100
      maxPages: 20,    // scan more pages, still bounded
      minHits: 120     // stop once we have plenty to render
    });

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(x => ({
        id: x.Id,
        name: x.Name || x.ItemName || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || x.MfgPartNo || '',
        upc: x.UPC || x.UPCCode || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || '',
      }));
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
};
