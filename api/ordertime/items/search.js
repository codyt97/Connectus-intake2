// /api/ordertime/items/search.js
const { listSearch } = require('../../_ot');

module.exports = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // Use a conservative set of columns to avoid noisy OT warnings
    const COLUMNS = [
      'ItemNumber', 'Number', 'SKU',
      'Name', 'Description',
      'ManufacturerPartNumber', 'ManufacturerPartNo', 'MfgPartNo',
      'UPC', 'UPCCode'
    ];

    const rows = await listSearch({
      type: 'PartItem',
      q,
      columns: COLUMNS,
      sortProp: 'Id',
      dir: 'Asc',
      pageSize: 100,
      maxPages: 8,
    });

    const seen = new Set();
    const out = [];
    for (const x of rows) {
      if (seen.has(x.Id)) continue;
      seen.add(x.Id);
      out.push({
        id:  x.Id,
        sku: x.ItemNumber ?? x.Number ?? x.SKU ?? '',
        name: x.Name ?? x.Description ?? '',
        description: x.Description ?? '',
        mfgPart: x.ManufacturerPartNumber ?? x.ManufacturerPartNo ?? x.MfgPartNo ?? '',
        upc: x.UPC ?? x.UPCCode ?? '',
        price: x.SalesPrice ?? x.Price ?? x.UnitPrice ?? 0
      });
    }

    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${e.message || e}` });
  }
};
