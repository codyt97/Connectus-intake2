const { scanList, val } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // Tokenize: "iphone 14 pro" => ["iphone","14","pro"]
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

    // Pull a bunch of PartItem rows safely (no server-side filters)
    const rows = await scanList({
      type: 'PartItem',
      sortProp: 'Name',
      dir: 'Asc',
      pageSize: 50,     // reasonable page size
      maxPages: 30      // scan up to ~1500 items; adjust if needed
    });

    const FIELDS = [
      'Name', 'ItemName', 'Number', 'SKU',
      'ManufacturerPartNo', 'MfgPartNo',
      'UPC', 'UPCCode',
      'Description'
    ];

    const matched = rows.filter(r => {
      const hay = FIELDS.map(f => val(r, f)).join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });

    // De-dupe by Id and map to the shape the UI expects
    const seen = new Set();
    const out = [];
    for (const x of matched) {
      if (seen.has(x.Id)) continue;
      seen.add(x.Id);
      out.push({
        id: x.Id,
        name: x.Name || x.ItemName || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || x.MfgPartNo || '',
        upc: x.UPC || x.UPCCode || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || x.SKU || '',
      });
      if (out.length >= 200) break; // protect the UI; raise if you want more
    }

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
};
