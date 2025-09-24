// CommonJS
const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const rows = await listSearch({
      type: 'PartItem',
      q,
      // Only names/numbers are “safer” to ask OT to filter; Description/UPC often crash OT.
      columns: ['Name', 'ItemName', 'Number', 'ManufacturerPartNo', 'UPC', 'Description'],
      sortProp: 'Id',
      dir: 'Asc',
      pageSize: 200,
      maxPages: 30,
      take: 80,
      tryServerFilters: false, // FORCE page-scan + local filter to avoid OT filter crashes
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

    res.status(200).json(out);
  } catch (err) {
    console.error('items/search', err);
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
};
